-- Disposable Supabase-shaped test prerequisites only.
-- The application schema comes exclusively from dueling-tournament-migration.sql.
begin;
do $$
declare role_name text;
begin
  if current_database() !~ '^infantry_dueling_test(_[a-z0-9]+)?$' then
    raise exception 'Refusing to install fixtures outside a named dueling test database';
  end if;
  if current_user <> 'postgres' then raise exception 'Use the local postgres test owner'; end if;
  foreach role_name in array array['anon','authenticated','service_role','dueling_test_anon'] loop
    if not exists(select 1 from pg_roles where rolname=role_name) then
      execute format('create role %I login',role_name);
    end if;
  end loop;
end $$;
alter role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role, dueling_test_anon;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table if not exists public.profiles(id uuid primary key, in_game_alias text);
insert into public.profiles(id,in_game_alias)
values ('66efeaff-8a9e-4ef3-95d1-acad7f6d402b','Local Director') on conflict do nothing;
create table if not exists public.tournaments(id uuid primary key);
create table if not exists public.tournament_participants(id uuid primary key, tournament_id uuid references public.tournaments(id));
create table if not exists public.tournament_matches(id uuid primary key, tournament_id uuid references public.tournaments(id));
create table if not exists public.dueling_matches(id uuid primary key);
create table if not exists public.dueling_stats(id uuid primary key);
create table if not exists public.dueling_aggregate_stats(id uuid primary key);
create table if not exists public.profile_aliases(id uuid primary key, profile_id uuid references public.profiles(id), alias text);
commit;
