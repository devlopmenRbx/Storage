-- ============================================================
-- FotoVault SAFE MIGRATION v2
-- ============================================================
-- Tujuan:
--   * Aman dijalankan pada database FotoVault yang SUDAH ADA.
--   * Tidak DROP TABLE.
--   * Tidak DROP DATA.
--   * Tidak mengasumsikan tabel lama sudah memiliki user_id.
--   * Membuat kolom yang belum ada secara kondisional.
--   * Menyiapkan RLS + Storage untuk user isolation.
--
-- PENTING:
--   1. Jalankan di Supabase SQL Editor.
--   2. Jalankan SELURUH file sekaligus.
--   3. Setelah selesai, cek bagian VERIFIKASI di paling bawah.
--   4. Backup database sebelum migration production.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. USER ROLES
-- ============================================================

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

-- Kalau tabel user_roles sudah ada tetapi user_id belum ada,
-- tambahkan user_id. Tidak menghapus kolom lama.
do $$
begin
  if to_regclass('public.user_roles') is not null
     and not exists (
       select 1
       from information_schema.columns
       where table_schema='public'
         and table_name='user_roles'
         and column_name='user_id'
     )
  then
    alter table public.user_roles add column user_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_roles'
      and column_name='role'
  ) then
    alter table public.user_roles add column role text default 'user';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_roles'
      and column_name='created_at'
  ) then
    alter table public.user_roles
      add column created_at timestamptz default now();
  end if;
end $$;

-- Pastikan role hanya user/admin bila constraint ini belum ada.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.user_roles'::regclass
      and conname='user_roles_role_check'
  ) then
    alter table public.user_roles
      add constraint user_roles_role_check
      check (role in ('user','admin'));
  end if;
exception when undefined_table then
  null;
end $$;

create index if not exists user_roles_user_id_idx
  on public.user_roles(user_id);

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

-- User biasa tidak boleh INSERT/UPDATE/DELETE role.

-- ============================================================
-- 2. PROFILES
-- ============================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='user_id'
  ) then
    alter table public.profiles add column user_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='display_name'
  ) then
    alter table public.profiles add column display_name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='avatar_path'
  ) then
    alter table public.profiles add column avatar_path text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='updated_at'
  ) then
    alter table public.profiles
      add column updated_at timestamptz default now();
  end if;
end $$;

create index if not exists profiles_user_id_idx
  on public.profiles(user_id);

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
-- 3. PHOTOS
-- ============================================================

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  path text,
  size bigint default 0,
  mime_type text,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='photos'
      and column_name='user_id'
  ) then
    alter table public.photos
      add column user_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='photos'
      and column_name='name'
  ) then
    alter table public.photos add column name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='photos'
      and column_name='path'
  ) then
    alter table public.photos add column path text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='photos'
      and column_name='size'
  ) then
    alter table public.photos add column size bigint default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='photos'
      and column_name='mime_type'
  ) then
    alter table public.photos add column mime_type text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='photos'
      and column_name='created_at'
  ) then
    alter table public.photos add column created_at timestamptz default now();
  end if;
end $$;

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
with check (auth.uid() = user_id);

drop policy if exists "photos_update_own" on public.photos;
create policy "photos_update_own"
on public.photos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "photos_delete_own" on public.photos;
create policy "photos_delete_own"
on public.photos
for delete
to authenticated
using (auth.uid() = user_id);

-- ============================================================
-- 4. SHARES
-- ============================================================

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='shares'
      and column_name='owner_id'
  ) then
    alter table public.shares add column owner_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='shares'
      and column_name='recipient_id'
  ) then
    alter table public.shares add column recipient_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='shares'
      and column_name='photo_id'
  ) then
    alter table public.shares add column photo_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='shares'
      and column_name='created_at'
  ) then
    alter table public.shares add column created_at timestamptz default now();
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='shares'
      and column_name='expires_at'
  ) then
    alter table public.shares add column expires_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='shares'
      and column_name='revoked_at'
  ) then
    alter table public.shares add column revoked_at timestamptz;
  end if;
end $$;

create index if not exists shares_owner_idx on public.shares(owner_id);
create index if not exists shares_recipient_idx on public.shares(recipient_id);
create index if not exists shares_photo_idx on public.shares(photo_id);

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
    select 1 from public.photos p
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
  user_id uuid references auth.users(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  type text default 'system',
  title text,
  message text,
  metadata jsonb default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications'
      and column_name='user_id'
  ) then
    alter table public.notifications add column user_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications'
      and column_name='sender_id'
  ) then
    alter table public.notifications add column sender_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications'
      and column_name='type'
  ) then
    alter table public.notifications add column type text default 'system';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications'
      and column_name='title'
  ) then
    alter table public.notifications add column title text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications'
      and column_name='message'
  ) then
    alter table public.notifications add column message text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications'
      and column_name='metadata'
  ) then
    alter table public.notifications
      add column metadata jsonb default '{}'::jsonb;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications'
      and column_name='read_at'
  ) then
    alter table public.notifications add column read_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications'
      and column_name='created_at'
  ) then
    alter table public.notifications
      add column created_at timestamptz default now();
  end if;
end $$;

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

-- User biasa tidak mendapat INSERT notification.
-- Share/admin notification sebaiknya dibuat backend.

-- ============================================================
-- 6. SITE SETTINGS / MAINTENANCE
-- ============================================================

create table if not exists public.site_settings (
  id bigint primary key default 1,
  maintenance boolean default false,
  maintenance_until timestamptz,
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='site_settings'
      and column_name='maintenance'
  ) then
    alter table public.site_settings add column maintenance boolean default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='site_settings'
      and column_name='maintenance_until'
  ) then
    alter table public.site_settings add column maintenance_until timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='site_settings'
      and column_name='updated_at'
  ) then
    alter table public.site_settings add column updated_at timestamptz default now();
  end if;
end $$;

insert into public.site_settings(id, maintenance, maintenance_until)
values (1, false, null)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists "site_settings_select_authenticated" on public.site_settings;
create policy "site_settings_select_authenticated"
on public.site_settings
for select
to authenticated
using (true);

-- ============================================================
-- 7. STORAGE
-- ============================================================

insert into storage.buckets(id, name, public)
values ('photos', 'photos', false)
on conflict (id) do update set public = false;

insert into storage.buckets(id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do update set public = false;

-- ============================================================
-- 8. STORAGE PHOTOS
-- Path yang digunakan:
--   USER_UUID/nama-file
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
-- 9. STORAGE AVATARS
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
-- 10. AUTO PROFILE + ROLE UNTUK USER BARU
-- ============================================================

create or replace function public.handle_new_fotovault_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles(user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_fotovault on auth.users;

create trigger on_auth_user_created_fotovault
after insert on auth.users
for each row
execute function public.handle_new_fotovault_user();

-- ============================================================
-- 11. ADMIN AUDIT LOG
-- Optional, tetapi dipakai oleh admin-api jika tersedia.
-- ============================================================

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.admin_audit_logs enable row level security;

-- Tidak ada policy SELECT untuk user biasa.
-- Admin API memakai service role.

create index if not exists admin_audit_logs_created_idx
on public.admin_audit_logs(created_at desc);

-- ============================================================
-- 12. VERIFIKASI
-- ============================================================

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema='public'
  and table_name in (
    'profiles',
    'user_roles',
    'photos',
    'shares',
    'notifications',
    'site_settings',
    'admin_audit_logs'
  )
order by table_name, ordinal_position;

select id, name, public
from storage.buckets
where id in ('photos','avatars')
order by id;

select
  user_id,
  role,
  created_at
from public.user_roles
order by created_at desc;

-- ============================================================
-- SELESAI
-- ============================================================
