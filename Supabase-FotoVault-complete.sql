-- ============================================================
-- FotoVault — Supabase Database + RLS + Storage
-- Lengkap untuk struktur project saat ini
--
-- PENTING:
-- 1. Jalankan di Supabase SQL Editor.
-- 2. Script ini TIDAK menghapus data yang sudah ada.
-- 3. Script menggunakan CREATE TABLE IF NOT EXISTS.
-- 4. Jangan pernah memasukkan service_role/secret key ke frontend.
-- 5. Setelah dijalankan, pastikan Edge Function admin-api juga
--    memverifikasi role admin dari server.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. PROFILES
-- ============================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ============================================================
-- 2. USER ROLES
-- ============================================================

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  constraint user_roles_role_check
    check (role in ('user','admin'))
);

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

-- Tidak ada INSERT/UPDATE/DELETE policy untuk user biasa.
-- Role admin harus diberikan dari SQL/secure backend, bukan frontend.

-- ============================================================
-- 3. PHOTOS
-- ============================================================

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime_type text,
  created_at timestamptz not null default now(),
  constraint photos_path_owner_format
    check (path like user_id::text || '/%')
);

create index if not exists photos_user_id_idx
  on public.photos(user_id);

create index if not exists photos_created_at_idx
  on public.photos(created_at desc);

alter table public.photos enable row level security;

drop policy if exists "photos_select_own" on public.photos;
create policy "photos_select_own"
on public.photos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "photos_insert_own" on public.photos;
create policy "photos_insert_own"
on public.photos
for insert
to authenticated
with check (
  auth.uid() = user_id
  and path like auth.uid()::text || '/%'
);

drop policy if exists "photos_update_own" on public.photos;
create policy "photos_update_own"
on public.photos
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and path like auth.uid()::text || '/%'
);

drop policy if exists "photos_delete_own" on public.photos;
create policy "photos_delete_own"
on public.photos
for delete
to authenticated
using (auth.uid() = user_id);

-- ============================================================
-- 4. SHARES
-- User A dapat membagikan foto kepada User B.
-- ============================================================

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint shares_owner_not_recipient
    check (owner_id <> recipient_id)
);

create index if not exists shares_owner_idx
  on public.shares(owner_id);

create index if not exists shares_recipient_idx
  on public.shares(recipient_id);

create index if not exists shares_photo_idx
  on public.shares(photo_id);

alter table public.shares enable row level security;

drop policy if exists "shares_select_participant" on public.shares;
create policy "shares_select_participant"
on public.shares
for select
to authenticated
using (
  auth.uid() = owner_id
  or auth.uid() = recipient_id
);

drop policy if exists "shares_insert_owner" on public.shares;
create policy "shares_insert_owner"
on public.shares
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.photos p
    where p.id = photo_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists "shares_update_owner" on public.shares;
create policy "shares_update_owner"
on public.shares
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "shares_delete_owner" on public.shares;
create policy "shares_delete_owner"
on public.shares
for delete
to authenticated
using (auth.uid() = owner_id);

-- ============================================================
-- 5. NOTIFICATIONS
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  type text not null default 'system',
  title text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
on public.notifications
for delete
to authenticated
using (auth.uid() = user_id);

-- User biasa TIDAK diberi INSERT policy.
-- Notifikasi share/admin sebaiknya dibuat oleh Edge Function
-- yang melakukan authorization di server.

-- ============================================================
-- 6. SITE SETTINGS / MAINTENANCE
-- ============================================================

create table if not exists public.site_settings (
  id bigint primary key default 1,
  maintenance boolean not null default false,
  maintenance_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

insert into public.site_settings(id, maintenance, maintenance_until)
values (1, false, null)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

-- Semua user boleh membaca status maintenance.
drop policy if exists "site_settings_select_authenticated" on public.site_settings;
create policy "site_settings_select_authenticated"
on public.site_settings
for select
to authenticated
using (true);

-- TIDAK memberikan update/insert/delete kepada browser user.
-- Perubahan maintenance dilakukan oleh admin-api/secure backend.

-- ============================================================
-- 7. TRIGGER PROFILE + ROLE DEFAULT
-- Setiap akun baru otomatis mendapat profile dan role user.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(user_id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (user_id) do nothing;

  insert into public.user_roles(user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_fotovault on auth.users;

create trigger on_auth_user_created_fotovault
after insert on auth.users
for each row
execute function public.handle_new_user();

-- ============================================================
-- 8. STORAGE BUCKETS
-- ============================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do update set public = false;

-- ============================================================
-- 9. STORAGE POLICY — PHOTOS
--
-- Struktur object:
-- photos bucket:
--   USER_UUID/random-file.jpg
--
-- User hanya boleh melihat object:
--   miliknya sendiri
--   ATAU foto yang secara aktif dibagikan kepadanya.
-- ============================================================

drop policy if exists "photos_storage_select" on storage.objects;
create policy "photos_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.shares s
      join public.photos p on p.id = s.photo_id
      where s.recipient_id = auth.uid()
        and s.revoked_at is null
        and (s.expires_at is null or s.expires_at > now())
        and p.path = storage.objects.name
        and p.user_id = s.owner_id
    )
  )
);

drop policy if exists "photos_storage_insert" on storage.objects;
create policy "photos_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "photos_storage_update" on storage.objects;
create policy "photos_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "photos_storage_delete" on storage.objects;
create policy "photos_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 10. STORAGE POLICY — AVATARS
--
-- Struktur:
-- avatars/USER_UUID/random-avatar.jpg
-- ============================================================

drop policy if exists "avatars_storage_select" on storage.objects;
create policy "avatars_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_storage_insert" on storage.objects;
create policy "avatars_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_storage_update" on storage.objects;
create policy "avatars_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_storage_delete" on storage.objects;
create policy "avatars_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 11. HELPER: jadikan user tertentu ADMIN
--
-- Ganti UUID di bawah dengan UID admin kamu.
-- Jangan menjalankan baris ini sebelum mengganti UUID.
--
-- insert into public.user_roles(user_id, role)
-- values ('ADMIN-USER-UUID-DI-SINI', 'admin')
-- on conflict (user_id) do update set role = 'admin';
--
-- ============================================================

-- ============================================================
-- 12. VERIFIKASI CEPAT
-- ============================================================

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'user_roles',
    'photos',
    'shares',
    'notifications',
    'site_settings'
  )
order by table_name;

select id, name, public
from storage.buckets
where id in ('photos','avatars')
order by id;

-- ============================================================
-- SELESAI
-- ============================================================
