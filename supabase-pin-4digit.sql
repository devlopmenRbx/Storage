-- ============================================================
-- FotoVault 4-Digit PIN Migration
-- Safe to run after Supabase-FotoVault-SAFE-v2.sql
-- Does not store plaintext PINs.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.user_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_salt text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_pins enable row level security;

-- Direct table access is intentionally denied. PIN operations go through
-- the SECURITY DEFINER RPC functions below.
drop policy if exists "user_pins_no_direct_select" on public.user_pins;
drop policy if exists "user_pins_no_direct_insert" on public.user_pins;
drop policy if exists "user_pins_no_direct_update" on public.user_pins;
drop policy if exists "user_pins_no_direct_delete" on public.user_pins;

create or replace function public.get_pin_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  has_pin boolean;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select exists(
    select 1 from public.user_pins where user_id = uid
  ) into has_pin;

  return jsonb_build_object(
    'has_pin', has_pin
  );
end;
$$;

create or replace function public.set_user_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  salt text;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN_MUST_BE_4_DIGITS';
  end if;

  salt := encode(gen_random_bytes(16), 'hex');

  insert into public.user_pins(
    user_id,
    pin_salt,
    pin_hash,
    failed_attempts,
    locked_until,
    created_at,
    updated_at
  )
  values(
    uid,
    salt,
    encode(digest(salt || ':' || p_pin, 'sha256'), 'hex'),
    0,
    null,
    now(),
    now()
  )
  on conflict (user_id) do update set
    pin_salt = excluded.pin_salt,
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

create or replace function public.verify_user_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_data public.user_pins%rowtype;
  expected_hash text;
  next_attempts integer;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'INVALID_PIN'
    );
  end if;

  select * into row_data
  from public.user_pins
  where user_id = uid
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'PIN_NOT_SET'
    );
  end if;

  if row_data.locked_until is not null
     and row_data.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'locked', true,
      'locked_until', row_data.locked_until
    );
  end if;

  expected_hash :=
    encode(
      digest(row_data.pin_salt || ':' || p_pin, 'sha256'),
      'hex'
    );

  if expected_hash = row_data.pin_hash then
    update public.user_pins
    set failed_attempts = 0,
        locked_until = null,
        updated_at = now()
    where user_id = uid;

    return jsonb_build_object(
      'ok', true,
      'locked', false
    );
  end if;

  next_attempts := row_data.failed_attempts + 1;

  if next_attempts >= 5 then
    update public.user_pins
    set failed_attempts = 0,
        locked_until = now() + interval '60 seconds',
        updated_at = now()
    where user_id = uid;

    return jsonb_build_object(
      'ok', false,
      'locked', true,
      'locked_until', now() + interval '60 seconds',
      'attempts_remaining', 0
    );
  end if;

  update public.user_pins
  set failed_attempts = next_attempts,
      updated_at = now()
  where user_id = uid;

  return jsonb_build_object(
    'ok', false,
    'locked', false,
    'attempts_remaining', 5 - next_attempts
  );
end;
$$;

revoke all on table public.user_pins from anon, authenticated;
grant execute on function public.get_pin_status() to authenticated;
grant execute on function public.set_user_pin(text) to authenticated;
grant execute on function public.verify_user_pin(text) to authenticated;

-- Verification
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_pins'
order by ordinal_position;
