-- ============================================================
-- FotoVault — SUPABASE FINAL / CURRENT WEBSITE SCHEMA
-- ============================================================
-- Basis: ZIP FotoVault terbaru yang diberikan pengguna.
--
-- Fitur yang benar-benar dipakai oleh frontend:
--   * Supabase Auth (email / Google / Apple)
--   * user_roles
--   * profiles
--   * vault_photos
--   * 4-digit PIN via RPC
--   * site_settings / maintenance timer
--   * avatars Storage
--   * realtime vault_photos
--
-- Kompatibilitas backend/admin-api:
--   * photos
--   * shares
--   * notifications
--   * admin_audit_logs
--
-- KEAMANAN:
--   * Tidak menyimpan password Auth.
--   * PIN disimpan sebagai hash bcrypt + salt.
--   * Service role / secret key TIDAK ada di SQL ini.
--   * RLS aktif pada tabel user-data.
--   * User hanya dapat membaca/mengubah data miliknya.
--
-- PENTING:
--   * Script ini TIDAK DROP TABLE dan TIDAK DELETE DATA.
--   * Jalankan di Supabase SQL Editor.
--   * Backup database production sebelum migration.
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

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='user_roles'
      and column_name='user_id'
  ) then
    alter table public.user_roles add column user_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='user_roles'
      and column_name='role'
  ) then
    alter table public.user_roles
      add column role text default 'user';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='user_roles'
      and column_name='created_at'
  ) then
    alter table public.user_roles
      add column created_at timestamptz default now();
  end if;
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

-- User tidak boleh mengubah role melalui frontend.
-- Admin role diberikan melalui secure SQL / Edge Function.

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
    where table_schema='public'
      and table_name='profiles'
      and column_name='user_id'
  ) then
    alter table public.profiles add column user_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='profiles'
      and column_name='display_name'
  ) then
    alter table public.profiles add column display_name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='profiles'
      and column_name='avatar_path'
  ) then
    alter table public.profiles add column avatar_path text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='profiles'
      and column_name='updated_at'
  ) then
    alter table public.profiles
      add column updated_at timestamptz default now();
  end if;
end $$;

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
-- 3. CURRENT WEBSITE PHOTO TABLE: vault_photos
-- ============================================================
-- dashboard.html benar-benar menggunakan:
--   image
--   liked
--   note
--   created_at
--
-- Frontend lama tidak mengirim user_id saat INSERT.
-- Karena itu trigger di bawah otomatis mengisi owner dari auth.uid().
-- ============================================================

create table if not exists public.vault_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  image text not null,
  liked boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='vault_photos'
      and column_name='user_id'
  ) then
    alter table public.vault_photos
      add column user_id uuid references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='vault_photos'
      and column_name='image'
  ) then
    alter table public.vault_photos add column image text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='vault_photos'
      and column_name='liked'
  ) then
    alter table public.vault_photos
      add column liked boolean default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='vault_photos'
      and column_name='note'
  ) then
    alter table public.vault_photos add column note text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='vault_photos'
      and column_name='created_at'
  ) then
    alter table public.vault_photos
      add column created_at timestamptz default now();
  end if;
end $$;

create index if not exists vault_photos_user_id_idx
  on public.vault_photos(user_id);

create index if not exists vault_photos_created_at_idx
  on public.vault_photos(created_at desc);

alter table public.vault_photos enable row level security;

-- Automatically attach new photos to the logged-in user.
create or replace function public.set_vault_photo_owner()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  if new.user_id is distinct from auth.uid() then
    raise exception 'PHOTO_OWNER_MISMATCH';
  end if;

  return new;
end;
$$;

drop trigger if exists vault_photos_owner_trigger
on public.vault_photos;

create trigger vault_photos_owner_trigger
before insert or update on public.vault_photos
for each row
execute function public.set_vault_photo_owner();

drop policy if exists "vault_photos_select_own" on public.vault_photos;
create policy "vault_photos_select_own"
on public.vault_photos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "vault_photos_insert_own" on public.vault_photos;
create policy "vault_photos_insert_own"
on public.vault_photos
for insert
to authenticated
with check (auth.uid() = user_id or user_id is null);

drop policy if exists "vault_photos_update_own" on public.vault_photos;
create policy "vault_photos_update_own"
on public.vault_photos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "vault_photos_delete_own" on public.vault_photos;
create policy "vault_photos_delete_own"
on public.vault_photos
for delete
to authenticated
using (auth.uid() = user_id);

-- ============================================================
-- 4. 4-DIGIT PIN
-- ============================================================
-- PIN tidak disimpan plaintext.
-- Hash menggunakan crypt(..., gen_salt('bf')).
-- Semua operasi dibatasi ke auth.uid() milik session saat ini.
-- ============================================================

create table if not exists public.user_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_pins enable row level security;

-- Tidak perlu SELECT policy untuk PIN.
-- Frontend menggunakan RPC security-definer.

revoke all on table public.user_pins from anon;
revoke all on table public.user_pins from authenticated;

-- Status PIN.
create or replace function public.get_pin_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_data public.user_pins%rowtype;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select *
  into row_data
  from public.user_pins
  where user_id = uid;

  return jsonb_build_object(
    'has_pin', row_data.user_id is not null,
    'locked_until', row_data.locked_until,
    'failed_attempts', coalesce(row_data.failed_attempts, 0)
  );
end;
$$;

-- Membuat / mengganti PIN.
create or replace function public.set_user_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN_MUST_BE_4_DIGITS';
  end if;

  insert into public.user_pins(
    user_id,
    pin_hash,
    failed_attempts,
    locked_until,
    updated_at
  )
  values (
    uid,
    crypt(p_pin, gen_salt('bf')),
    0,
    null,
    now()
  )
  on conflict (user_id)
  do update set
    pin_hash = excluded.pin_hash,
    failed_attempts = 0,
    locked_until = null,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'has_pin', true
  );
end;
$$;

-- Verifikasi PIN.
-- 5 kesalahan -> lock 60 detik.
create or replace function public.verify_user_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_data public.user_pins%rowtype;
  new_failures integer;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object(
      'ok', false,
      'valid', false,
      'reason', 'INVALID_PIN_FORMAT'
    );
  end if;

  select *
  into row_data
  from public.user_pins
  where user_id = uid
  for update;

  if row_data.user_id is null then
    return jsonb_build_object(
      'ok', false,
      'valid', false,
      'reason', 'PIN_NOT_SET'
    );
  end if;

  if row_data.locked_until is not null
     and row_data.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'valid', false,
      'reason', 'LOCKED',
      'locked_until', row_data.locked_until
    );
  end if;

  if crypt(p_pin, row_data.pin_hash) = row_data.pin_hash then
    update public.user_pins
    set failed_attempts = 0,
        locked_until = null,
        updated_at = now()
    where user_id = uid;

    return jsonb_build_object(
      'ok', true,
      'valid', true
    );
  end if;

  new_failures := coalesce(row_data.failed_attempts, 0) + 1;

  if new_failures >= 5 then
    update public.user_pins
    set failed_attempts = 0,
        locked_until = now() + interval '60 seconds',
        updated_at = now()
    where user_id = uid;

    return jsonb_build_object(
      'ok', false,
      'valid', false,
      'reason', 'LOCKED',
      'locked_until', now() + interval '60 seconds'
    );
  end if;

  update public.user_pins
  set failed_attempts = new_failures,
      updated_at = now()
  where user_id = uid;

  return jsonb_build_object(
    'ok', false,
    'valid', false,
    'reason', 'INVALID_PIN',
    'failed_attempts', new_failures,
    'remaining_attempts', 5 - new_failures
  );
end;
$$;

grant execute on function public.get_pin_status() to authenticated;
grant execute on function public.set_user_pin(text) to authenticated;
grant execute on function public.verify_user_pin(text) to authenticated;

-- ============================================================
-- 5. SITE SETTINGS / MAINTENANCE TIMER
-- ============================================================

create table if not exists public.site_settings (
  id bigint primary key default 1,
  maintenance boolean not null default false,
  maintenance_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.site_settings(id, maintenance, maintenance_until)
values (1, false, null)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

-- Frontend perlu dapat membaca status maintenance.
drop policy if exists "site_settings_select" on public.site_settings;
create policy "site_settings_select"
on public.site_settings
for select
to anon, authenticated
using (id = 1);

-- Tidak ada INSERT/UPDATE/DELETE policy untuk frontend.
-- Admin API menggunakan service/secret key di server.

-- ============================================================
-- 6. COMPATIBILITY: system_settings
-- ============================================================
-- admin.html versi lama membaca:
--   system_settings
--   key = 'maintenance_mode'
--
-- Kita sediakan tabel kompatibilitas agar halaman lama tidak error.
-- ============================================================

create table if not exists public.system_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

insert into public.system_settings(key, value)
values ('maintenance_mode', 'false')
on conflict (key) do nothing;

alter table public.system_settings enable row level security;

drop policy if exists "system_settings_select" on public.system_settings;
create policy "system_settings_select"
on public.system_settings
for select
to authenticated
using (true);

-- Sinkronisasi site_settings -> system_settings.
create or replace function public.sync_maintenance_compat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.system_settings(key, value, updated_at)
  values (
    'maintenance_mode',
    case
      when new.maintenance
       and (
         new.maintenance_until is null
         or new.maintenance_until > now()
       )
      then 'true'
      else 'false'
    end,
    now()
  )
  on conflict (key)
  do update set
    value = excluded.value,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists site_settings_maintenance_sync
on public.site_settings;

create trigger site_settings_maintenance_sync
after insert or update on public.site_settings
for each row
execute function public.sync_maintenance_compat();

-- ============================================================
-- 7. PROFILE + ROLE OTOMATIS SAAT USER BARU
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

  insert into public.profiles(
    user_id,
    display_name,
    updated_at
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    now()
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_fotovault
on auth.users;

create trigger on_auth_user_created_fotovault
after insert on auth.users
for each row
execute function public.handle_new_fotovault_user();

-- ============================================================
-- 8. ADMIN-API COMPATIBILITY TABLE: photos
-- ============================================================
-- admin-api versi backend menggunakan tabel photos.
-- Website saat ini memakai vault_photos.
-- Tabel ini disiapkan untuk operasi admin/API dan future migration.
-- ============================================================

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text,
  path text,
  size bigint not null default 0,
  mime_type text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='photos'
      and column_name='user_id'
  ) then
    alter table public.photos add column user_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='photos'
      and column_name='name'
  ) then
    alter table public.photos add column name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='photos'
      and column_name='path'
  ) then
    alter table public.photos add column path text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='photos'
      and column_name='size'
  ) then
    alter table public.photos add column size bigint default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='photos'
      and column_name='mime_type'
  ) then
    alter table public.photos add column mime_type text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='photos'
      and column_name='created_at'
  ) then
    alter table public.photos add column created_at timestamptz default now();
  end if;
end $$;

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
-- 9. SHARES
-- ============================================================

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

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

create index if not exists shares_owner_idx
on public.shares(owner_id);

create index if not exists shares_recipient_idx
on public.shares(recipient_id);

create index if not exists shares_photo_idx
on public.shares(photo_id);

-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  type text not null default 'system',
  title text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

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

create index if not exists notifications_user_idx
on public.notifications(user_id, created_at desc);

-- Tidak ada INSERT policy untuk user biasa.
-- Notification admin/share dibuat oleh secure backend.

-- ============================================================
-- 11. ADMIN AUDIT LOG
-- ============================================================

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs enable row level security;

-- Tidak memberi SELECT ke user biasa.
-- Edge Function menggunakan service/secret key.

create index if not exists admin_audit_logs_created_idx
on public.admin_audit_logs(created_at desc);

-- ============================================================
-- 12. STORAGE BUCKET AVATARS
-- ============================================================

insert into storage.buckets(id, name, public)
values ('avatars', 'avatars', false)
on conflict (id)
do update set public = false;

drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
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

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 13. OPTIONAL PRIVATE PHOTOS STORAGE
-- ============================================================
-- Frontend saat ini menyimpan base64 di vault_photos.
-- Bucket ini disiapkan untuk admin-api/future storage migration.
-- ============================================================

insert into storage.buckets(id, name, public)
values ('photos', 'photos', false)
on conflict (id)
do update set public = false;

drop policy if exists "photos_storage_select_own" on storage.objects;
create policy "photos_storage_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "photos_storage_insert_own" on storage.objects;
create policy "photos_storage_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "photos_storage_update_own" on storage.objects;
create policy "photos_storage_update_own"
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

drop policy if exists "photos_storage_delete_own" on storage.objects;
create policy "photos_storage_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 14. REALTIME vault_photos
-- ============================================================

do $$
begin
  begin
    alter publication supabase_realtime
      add table public.vault_photos;
  exception
    when duplicate_object then
      null;
    when undefined_object then
      null;
  end;
end $$;

-- ============================================================
-- 15. ADMIN HELPER
-- ============================================================
-- Jalankan TERPISAH jika ingin menjadikan UID tertentu admin.
--
-- update public.user_roles
-- set role = 'admin'
-- where user_id = 'UID-ADMIN';
--
-- Jika row belum ada:
--
-- insert into public.user_roles(user_id, role)
-- values ('UID-ADMIN', 'admin')
-- on conflict (user_id)
-- do update set role = 'admin';

-- ============================================================
-- 16. VERIFIKASI
-- ============================================================

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'user_roles',
    'profiles',
    'vault_photos',
    'user_pins',
    'site_settings',
    'system_settings',
    'photos',
    'shares',
    'notifications',
    'admin_audit_logs'
  )
order by table_name, ordinal_position;

select
  id,
  name,
  public
from storage.buckets
where id in ('avatars', 'photos')
order by id;

select
  user_id,
  role,
  created_at
from public.user_roles
order by created_at desc;

select
  id,
  maintenance,
  maintenance_until,
  updated_at
from public.site_settings
where id = 1;

-- ============================================================
-- SELESAI
-- ============================================================
