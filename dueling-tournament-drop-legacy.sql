-- Freeinf: separate cleanup after the route-removal deployment.
-- Only the three owner-confirmed legacy tables are removed. Never use CASCADE.
-- Stop if rows or outside dependencies appeared since the owner's confirmation.
begin;
lock table public.tournament_matches, public.tournament_participants, public.tournaments
  in access exclusive mode;
do $$
begin
  if exists(select 1 from public.tournaments)
    or exists(select 1 from public.tournament_participants)
    or exists(select 1 from public.tournament_matches) then
    raise exception 'Legacy tournament tables are no longer empty. No tables were removed.';
  end if;
end $$;
drop table public.tournament_matches, public.tournament_participants, public.tournaments;
-- Verify cleanup before commit so a failed check restores all three tables.
do $$
begin
  if to_regclass('public.tournaments') is not null
    or to_regclass('public.tournament_participants') is not null
    or to_regclass('public.tournament_matches') is not null then
    raise exception 'Legacy cleanup verification failed: expected all three tables to be gone.';
  end if;
end $$;
commit;

-- Keep the single summary row last so SQL editors display it after COMMIT.
select 'cleanup_verified' as status,
  to_regclass('public.tournaments') is null as tournaments_removed,
  to_regclass('public.tournament_participants') is null as participants_removed,
  to_regclass('public.tournament_matches') is null as matches_removed;
