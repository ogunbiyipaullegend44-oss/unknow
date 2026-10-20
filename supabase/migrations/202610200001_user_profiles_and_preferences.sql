create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 80),
  username text check (username is null or username ~ '^[a-z0-9_]{3,24}$'),
  avatar_path text check (avatar_path is null or length(avatar_path) <= 300),
  research_interests text[] not null default '{}'
    check (
      cardinality(research_interests) <= 20
      and length(array_to_string(research_interests, '')) <= 1600
    ),
  research_purpose text not null default 'general'
    check (research_purpose in ('academic', 'assignment', 'journalism', 'business', 'general', 'other')),
  bio text not null default '' check (length(bio) <= 500),
  research_preferences jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(research_preferences) = 'object'
      and octet_length(research_preferences::text) <= 8192
      and (
        research_preferences ->> 'theme' is null
        or research_preferences ->> 'theme' in ('system', 'light', 'dark')
      )
      and (
        research_preferences ->> 'default_purpose' is null
        or research_preferences ->> 'default_purpose' in ('academic', 'assignment', 'journalism', 'business', 'general', 'other')
      )
      and (
        research_preferences ->> 'geographic_focus' is null
        or research_preferences ->> 'geographic_focus' in ('worldwide', 'region')
      )
      and (
        research_preferences ->> 'geographic_focus' is distinct from 'region'
        or length(btrim(coalesce(research_preferences ->> 'region', ''))) between 1 and 160
      )
      and (
        research_preferences ->> 'publication_period' is null
        or research_preferences ->> 'publication_period' in ('any', '1', '3', '5')
      )
      and (
        research_preferences ->> 'default_view' is null
        or research_preferences ->> 'default_view' in ('overview', 'discovery', 'sources')
      )
      and length(coalesce(research_preferences ->> 'region', '')) <= 160
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index user_profiles_username_unique
  on public.user_profiles (lower(username))
  where username is not null;

alter table public.user_profiles enable row level security;

create policy "Users can read their own profile"
on public.user_profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Users can create their own profile"
on public.user_profiles for insert to authenticated
with check (id = (select auth.uid()));

create policy "Users can update their own profile"
on public.user_profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

grant select, insert, update on public.user_profiles to authenticated;
revoke all on public.user_profiles from anon;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_community_updated_at();

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_user_profile() from public, anon, authenticated;

create trigger auth_user_create_profile
after insert on auth.users
for each row execute function public.create_user_profile();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can view their own avatar files"
on storage.objects for select to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can upload their own avatar files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their own avatar files"
on storage.objects for update to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can remove their own avatar files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'user-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := (select auth.uid());
  authentication_time bigint := nullif(auth.jwt() ->> 'auth_time', '')::bigint;
begin
  if requesting_user is null then
    raise exception 'Authentication is required.';
  end if;
  if authentication_time is null
    or extract(epoch from now())::bigint - authentication_time > 600 then
    raise exception 'Reauthentication is required before deleting this account.';
  end if;
  delete from auth.users where id = requesting_user;
  if not found then
    raise exception 'The authenticated account could not be found.';
  end if;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
