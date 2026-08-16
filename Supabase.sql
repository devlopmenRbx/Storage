-- FotoVault: RLS ketat + sharing + notifikasi + profile photo
create extension if not exists pgcrypto;

create table if not exists public.profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text,
 avatar_path text,
 updated_at timestamptz not null default now()
);
create table if not exists public.photos(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,path text not null unique,size bigint not null default 0,
 mime_type text not null,created_at timestamptz not null default now()
);
create table if not exists public.photo_shares(
 id uuid primary key default gen_random_uuid(),
 photo_id uuid not null references public.photos(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(photo_id,recipient_id)
);
create table if not exists public.notifications(
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 type text not null,
 title text not null,
 body text not null,
 photo_id uuid references public.photos(id) on delete cascade,
 is_read boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.albums(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null,created_at timestamptz not null default now());
create table if not exists public.user_roles(user_id uuid primary key references auth.users(id) on delete cascade,role text not null default 'user' check(role in('user','admin')),created_at timestamptz not null default now());
create table if not exists public.storage_quotas(user_id uuid primary key references auth.users(id) on delete cascade,quota_bytes bigint not null default 1073741824,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.system_settings(key text primary key,value text not null default '',updated_at timestamptz not null default now(),updated_by uuid references auth.users(id) on delete set null);
create table if not exists public.admin_audit_logs(id uuid primary key default gen_random_uuid(),admin_id uuid references auth.users(id) on delete set null,action text not null,target_user_id uuid references auth.users(id) on delete set null,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());

alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.photo_shares enable row level security;
alter table public.notifications enable row level security;
alter table public.albums enable row level security;
alter table public.user_roles enable row level security;
alter table public.storage_quotas enable row level security;
alter table public.system_settings enable row level security;
alter table public.admin_audit_logs enable row level security;

create or replace function public.is_admin() returns boolean language sql security definer stable set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin'); $$;

-- Profiles: user hanya profile sendiri; nama/avatar user lain hanya boleh dibaca jika dibutuhkan oleh share picker melalui fungsi backend.
drop policy if exists profiles_select_own on public.profiles; drop policy if exists profiles_insert_own on public.profiles; drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using(auth.uid()=user_id or public.is_admin());
create policy profiles_insert_own on public.profiles for insert to authenticated with check(auth.uid()=user_id);
create policy profiles_update_own on public.profiles for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- PHOTO: pemilik melihat foto sendiri; penerima hanya melihat foto yang memang dibagikan kepadanya; admin dapat mengakses untuk kebutuhan admin.
drop policy if exists photos_select_strict on public.photos; drop policy if exists photos_insert_own on public.photos; drop policy if exists photos_delete_own on public.photos;
create policy photos_select_strict on public.photos for select to authenticated using(auth.uid()=user_id or public.is_admin() or exists(select 1 from public.photo_shares s where s.photo_id=photos.id and s.recipient_id=auth.uid()));
create policy photos_insert_own on public.photos for insert to authenticated with check(auth.uid()=user_id);
create policy photos_delete_own on public.photos for delete to authenticated using(auth.uid()=user_id or public.is_admin());

-- Share: owner membuat/menghapus share; recipient dapat melihat record share miliknya.
drop policy if exists shares_owner_manage on public.photo_shares; drop policy if exists shares_recipient_select on public.photo_shares;
create policy shares_owner_manage on public.photo_shares for all to authenticated using(auth.uid()=owner_id or public.is_admin()) with check(auth.uid()=owner_id or public.is_admin());
create policy shares_recipient_select on public.photo_shares for select to authenticated using(auth.uid()=recipient_id);

-- Notifications hanya milik recipient; actor boleh tidak bisa membaca inbox orang lain.
drop policy if exists notifications_select_own on public.notifications; drop policy if exists notifications_update_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using(auth.uid()=recipient_id);
create policy notifications_update_own on public.notifications for update to authenticated using(auth.uid()=recipient_id) with check(auth.uid()=recipient_id);

-- Trigger membuat notifikasi ketika foto dibagikan.
create or replace function public.notify_photo_share() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(recipient_id,actor_id,type,title,body,photo_id)
 values(NEW.recipient_id,NEW.owner_id,'photo_shared','Foto dibagikan','Seseorang membagikan foto kepada kamu.',NEW.photo_id);
 return NEW;
end; $$;
drop trigger if exists trg_photo_share_notify on public.photo_shares;
create trigger trg_photo_share_notify after insert on public.photo_shares for each row execute function public.notify_photo_share();

-- Albums
DROP POLICY IF EXISTS albums_select_own ON public.albums; DROP POLICY IF EXISTS albums_insert_own ON public.albums; DROP POLICY IF EXISTS albums_update_own ON public.albums; DROP POLICY IF EXISTS albums_delete_own ON public.albums;
create policy albums_select_own on public.albums for select to authenticated using(auth.uid()=user_id or public.is_admin());
create policy albums_insert_own on public.albums for insert to authenticated with check(auth.uid()=user_id);
create policy albums_update_own on public.albums for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy albums_delete_own on public.albums for delete to authenticated using(auth.uid()=user_id or public.is_admin());

-- Roles/Quota/Admin
DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles; DROP POLICY IF EXISTS user_roles_admin ON public.user_roles;
create policy user_roles_select_own on public.user_roles for select to authenticated using(auth.uid()=user_id or public.is_admin());
create policy user_roles_admin on public.user_roles for all to authenticated using(public.is_admin()) with check(public.is_admin());
DROP POLICY IF EXISTS quota_select ON public.storage_quotas; DROP POLICY IF EXISTS quota_admin ON public.storage_quotas;
create policy quota_select on public.storage_quotas for select to authenticated using(auth.uid()=user_id or public.is_admin());
create policy quota_admin on public.storage_quotas for all to authenticated using(public.is_admin()) with check(public.is_admin());
DROP POLICY IF EXISTS settings_admin ON public.system_settings;
create policy settings_admin on public.system_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
DROP POLICY IF EXISTS audit_admin_select ON public.admin_audit_logs; DROP POLICY IF EXISTS audit_admin_insert ON public.admin_audit_logs;
create policy audit_admin_select on public.admin_audit_logs for select to authenticated using(public.is_admin());
create policy audit_admin_insert on public.admin_audit_logs for insert to authenticated with check(public.is_admin());

-- Storage private.
insert into storage.buckets(id,name,public) values('photos','photos',false) on conflict(id) do update set public=false;
insert into storage.buckets(id,name,public) values('avatars','avatars',false) on conflict(id) do update set public=false;
DROP POLICY IF EXISTS photo_objects_select_own ON storage.objects; DROP POLICY IF EXISTS photo_objects_insert_own ON storage.objects; DROP POLICY IF EXISTS photo_objects_delete_own ON storage.objects;
create policy photo_objects_select_own on storage.objects for select to authenticated using(bucket_id='photos' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin() or exists(select 1 from public.photo_shares s join public.photos p on p.id=s.photo_id where p.path=name and s.recipient_id=auth.uid())));
create policy photo_objects_insert_own on storage.objects for insert to authenticated with check(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy photo_objects_delete_own on storage.objects for delete to authenticated using(bucket_id='photos' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
DROP POLICY IF EXISTS avatar_objects_select_own ON storage.objects; DROP POLICY IF EXISTS avatar_objects_insert_own ON storage.objects; DROP POLICY IF EXISTS avatar_objects_update_own ON storage.objects; DROP POLICY IF EXISTS avatar_objects_delete_own ON storage.objects;
create policy avatar_objects_select_own on storage.objects for select to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_objects_insert_own on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_objects_update_own on storage.objects for update to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatar_objects_delete_own on storage.objects for delete to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);

insert into public.system_settings(key,value) values('maintenance_mode','false'),('maintenance_message','FotoVault sedang dalam pemeliharaan.'),('default_quota_bytes','1073741824') on conflict(key) do nothing;

-- Admin pertama:
-- insert into public.user_roles(user_id,role) values('a305afa1-c0f8-4a64-b6fb-af60fa198b34','admin') on conflict(user_id) do update set role='admin';

-- Helper aman untuk share berdasarkan email. Tidak memberikan akses langsung ke auth.users.
create or replace function public.find_user_by_email_for_share(target_email text)
returns table(user_id uuid) language sql security definer stable set search_path=public,auth as $$
  select id from auth.users where lower(email)=lower(target_email) limit 1;
$$;
revoke all on function public.find_user_by_email_for_share(text) from public;
grant execute on function public.find_user_by_email_for_share(text) to authenticated;


-- FotoVault Premium: public maintenance state
create table if not exists public.site_settings (
  id bigint primary key default 1 check (id = 1),
  maintenance boolean not null default false,
  maintenance_until timestamptz null,
  updated_at timestamptz not null default now()
);
insert into public.site_settings(id) values (1) on conflict (id) do nothing;
alter table public.site_settings enable row level security;
drop policy if exists "Public can read maintenance" on public.site_settings;
create policy "Public can read maintenance"
on public.site_settings for select
to anon, authenticated
using (true);
