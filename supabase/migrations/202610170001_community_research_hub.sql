create table public.community_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.community_moderators enable row level security;

create or replace function public.is_community_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_moderators
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_community_moderator() from public, anon;
grant execute on function public.is_community_moderator() to authenticated;

create table public.community_publications (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  workspace_file_id text not null check (length(workspace_file_id) between 1 and 200),
  author_name text not null check (length(author_name) between 1 and 80),
  title text not null check (length(title) between 1 and 160),
  description text not null check (length(description) between 1 and 1000),
  category text not null check (length(category) between 1 and 80),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 30),
  location text not null default '' check (length(location) <= 160),
  published_on date not null default current_date,
  document_content text not null check (length(document_content) between 1 and 100000),
  source_references jsonb not null default '[]'::jsonb
    check (case when jsonb_typeof(source_references) = 'array' then jsonb_array_length(source_references) <= 100 else false end),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(keywords, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(location, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(document_content, '')), 'D')
  ) stored,
  constraint community_publications_author_file_unique unique (author_id, workspace_file_id)
);

create index community_publications_search_idx
  on public.community_publications using gin (search_document);
create index community_publications_published_date_idx
  on public.community_publications (published_on desc)
  where is_published;
create index community_publications_author_idx
  on public.community_publications (author_id, updated_at desc);

create table public.community_ratings (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.community_publications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (publication_id, user_id)
);

create index community_ratings_publication_idx
  on public.community_ratings (publication_id);

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.community_publications(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('misleading', 'plagiarised', 'inappropriate', 'other')),
  details text not null check (length(details) between 10 and 1000),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create index community_reports_status_date_idx
  on public.community_reports (status, created_at desc);

create or replace function public.set_community_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger community_publications_set_updated_at
before update on public.community_publications
for each row execute function public.set_community_updated_at();

create trigger community_ratings_set_updated_at
before update on public.community_ratings
for each row execute function public.set_community_updated_at();

create or replace function public.reject_own_publication_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.community_publications
    where id = new.publication_id and author_id = new.user_id
  ) then
    raise exception 'Authors cannot rate their own publication.';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_own_publication_rating() from public, anon, authenticated;

create trigger community_ratings_prevent_author_rating
before insert or update of publication_id, user_id
on public.community_ratings
for each row execute function public.reject_own_publication_rating();

alter table public.community_publications enable row level security;
alter table public.community_ratings enable row level security;
alter table public.community_reports enable row level security;

create policy "Published research is readable, owners and moderators see all"
on public.community_publications for select to authenticated
using (is_published or author_id = (select auth.uid()) or (select public.is_community_moderator()));

create policy "Members publish as themselves"
on public.community_publications for insert to authenticated
with check (author_id = (select auth.uid()));

create policy "Owners and moderators update publications"
on public.community_publications for update to authenticated
using (author_id = (select auth.uid()) or (select public.is_community_moderator()))
with check (author_id = (select auth.uid()) or (select public.is_community_moderator()));

create policy "Owners and moderators remove publications"
on public.community_publications for delete to authenticated
using (author_id = (select auth.uid()) or (select public.is_community_moderator()));

create policy "Published ratings and own publication ratings are readable"
on public.community_ratings for select to authenticated
using (
  exists (
    select 1 from public.community_publications publication
    where publication.id = publication_id
    and (
      publication.is_published
      or publication.author_id = (select auth.uid())
      or (select public.is_community_moderator())
    )
  )
);

create policy "Members rate other members published research"
on public.community_ratings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.community_publications publication
    where publication.id = publication_id
      and publication.is_published
      and publication.author_id <> (select auth.uid())
  )
);

create policy "Members update their own rating"
on public.community_ratings for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.community_publications publication
    where publication.id = publication_id
      and publication.is_published
      and publication.author_id <> (select auth.uid())
  )
);

create policy "Members remove their own rating"
on public.community_ratings for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Reporters and moderators can read reports"
on public.community_reports for select to authenticated
using (reporter_id = (select auth.uid()) or (select public.is_community_moderator()));

create policy "Members report published research"
on public.community_reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and exists (
    select 1 from public.community_publications publication
    where publication.id = publication_id and publication.is_published
  )
);

create policy "Moderators resolve reports"
on public.community_reports for update to authenticated
using ((select public.is_community_moderator()))
with check ((select public.is_community_moderator()));

create view public.community_publications_with_stats
with (security_invoker = true)
as
select
  publication.*,
  coalesce(avg(rating.rating)::double precision, 0) as average_rating,
  count(rating.id)::integer as rating_count
from public.community_publications publication
left join public.community_ratings rating on rating.publication_id = publication.id
group by publication.id;

grant select, insert, update, delete on public.community_publications to authenticated;
grant select, insert, update, delete on public.community_ratings to authenticated;
grant select, insert, update on public.community_reports to authenticated;
grant select on public.community_publications_with_stats to authenticated;
