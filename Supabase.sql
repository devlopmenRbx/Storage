-- FotoVault iOS Premium database
create extension if not exists pgcrypto;

create table if not exists public.photos(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,path text not null unique,size bigint not null default 0,
 mime_type text not null,created_at timestamptz not null default now()
);
create table if not exists public.albums(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,created_at timestamptz not null default now()
);
create table if not exists public.user_roles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'user' check(role in('user','admin')),
 created_at timestamptz not null default now()
);
create table if not exists public.storage_quotas(
 user_id uuid primary key references auth.users(id) on delete cascade,
 quota_bytes bigint not null default 1073741824,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.system_settings(
 key text primary key,value text not null default '',
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
create table if not exists public.admin_audit_logs(
 id uuid primary key default gen_random_uuid(),
 admin_id uuid references auth.users(id) on delete set null,
 action text not null,target_user_id uuid references auth.users(id) on delete set null,
 details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);

alter table public.photos enable row level security;
alter table public.albums enable row level security;
alter table public.user_roles enable row level security;
alter table public.storage_quotas enable row level security;
alter table public.system_settings enable row level security;
alter table public.admin_audit_logs enable row level security;

create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path=public as $$
select exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin');
$$;

drop policy if exists photos_select_own on public.photos;
drop policy if exists photos_insert_own on public.photos;
drop policy if exists photos_delete_own on public.photos;
create policy photos_select_own on public.photos for select to authenticated using(auth.uid()=user_id or public.is_admin());
create policy photos_insert_own on public.photos for insert to authenticated with check(auth.uid()=user_id);
create policy photos_delete_own on public.photos for delete to authenticated using(auth.uid()=user_id or public.is_admin());

drop policy if exists albums_select_own on public.albums;
drop policy if exists albums_insert_own on public.albums;
drop policy if exists albums_update_own on public.albums;
drop policy if exists albums_delete_own on public.albums;
create policy albums_select_own on public.albums for select to authenticated using(auth.uid()=user_id or public.is_admin());
create policy albums_insert_own on public.albums for insert to authenticated with check(auth.uid()=user_id);
create policy albums_update_own on public.albums for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy albums_delete_own on public.albums for delete to authenticated using(auth.uid()=user_id or public.is_admin());

drop policy if exists user_roles_select_own on public.user_roles;
drop policy if exists user_roles_admin on public.user_roles;
create policy user_roles_select_own on public.user_roles for select to authenticated using(auth.uid()=user_id or public.is_admin());
create policy user_roles_admin on public.user_roles for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists quota_select on public.storage_quotas;
drop policy if exists quota_admin on public.storage_quotas;
create policy quota_select on public.storage_quotas for select to authenticated using(auth.uid()=user_id or public.is_admin());
create policy quota_admin on public.storage_quotas for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists settings_admin on public.system_settings;
create policy settings_admin on public.system_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists audit_admin_select on public.admin_audit_logs;
drop policy if exists audit_admin_insert on public.admin_audit_logs;
create policy audit_admin_select on public.admin_audit_logs for select to authenticated using(public.is_admin());
create policy audit_admin_insert on public.admin_audit_logs for insert to authenticated with check(public.is_admin());

insert into storage.buckets(id,name,public) values('photos','photos',false)
on conflict(id) do update set public=false;

drop policy if exists photo_objects_select_own on storage.objects;
drop policy if exists photo_objects_insert_own on storage.objects;
drop policy if exists photo_objects_delete_own on storage.objects;
create policy photo_objects_select_own on storage.objects for select to authenticated using(bucket_id='photos' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy photo_objects_insert_own on storage.objects for insert to authenticated with check(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy photo_objects_delete_own on storage.objects for delete to authenticated using(bucket_id='photos' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

insert into public.system_settings(key,value) values
('maintenance_mode','false'),
('maintenance_message','FotoVault sedang dalam pemeliharaan.'),
('default_quota_bytes','1073741824')
on conflict(key) do nothing;

-- Setelah menemukan UID admin, jalankan:
-- insert into public.user_roles(user_id,role)
-- values('UUID_ADMIN_KAMU','admin')
-- on conflict(user_id) do update set role='admin';
