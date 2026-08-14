-- FotoVault database + security policies
-- Jalankan seluruh SQL ini di Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime_type text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.photos enable row level security;
alter table public.albums enable row level security;

drop policy if exists "photos_select_own" on public.photos;
drop policy if exists "photos_insert_own" on public.photos;
drop policy if exists "photos_delete_own" on public.photos;
drop policy if exists "albums_select_own" on public.albums;
drop policy if exists "albums_insert_own" on public.albums;
drop policy if exists "albums_update_own" on public.albums;
drop policy if exists "albums_delete_own" on public.albums;

create policy "photos_select_own" on public.photos
for select to authenticated using (auth.uid() = user_id);

create policy "photos_insert_own" on public.photos
for insert to authenticated with check (auth.uid() = user_id);

create policy "photos_delete_own" on public.photos
for delete to authenticated using (auth.uid() = user_id);

create policy "albums_select_own" on public.albums
for select to authenticated using (auth.uid() = user_id);

create policy "albums_insert_own" on public.albums
for insert to authenticated with check (auth.uid() = user_id);

create policy "albums_update_own" on public.albums
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "albums_delete_own" on public.albums
for delete to authenticated using (auth.uid() = user_id);

-- Buat bucket PRIVATE bernama "photos" di Storage.
-- Policy berikut membatasi setiap user ke folder yang namanya sama dengan user ID.

drop policy if exists "photo_objects_select_own" on storage.objects;
drop policy if exists "photo_objects_insert_own" on storage.objects;
drop policy if exists "photo_objects_delete_own" on storage.objects;

create policy "photo_objects_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "photo_objects_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "photo_objects_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Catatan:
-- 1. Buat bucket "photos" sebagai PRIVATE, bukan public.
-- 2. Jangan pernah memasukkan secret/service_role key ke app.js.
-- 3. App ini menampilkan pemakaian 1 GB sebagai batas UI.
--    Jika ingin batas storage benar-benar dipaksa server-side,
--    tambahkan trigger/function quota pada database atau Edge Function.
