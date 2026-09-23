-- Local integration schema only. The production mapping awaits owner verification.
begin;
do $$
begin
  if current_database() !~ '^infantry_dueling_test(_[a-z0-9]+)?$' then
    raise exception 'Refusing to install test objects outside a named dueling test database';
  end if;
end $$;

create table if not exists public.dueling_tournament_records (
  id text primary key,
  slug text not null unique,
  revision bigint not null check (revision >= 0),
  state jsonb not null,
  check (state->>'id' = id),
  check ((state->>'revision')::bigint = revision),
  check (state #>> '{settings,slug}' = slug)
);
create table if not exists public.dueling_tournament_directors (
  user_id text primary key,
  granted_at timestamptz not null default now()
);
create table if not exists public.dueling_tournament_operations (
  actor_id text not null,
  operation_id uuid not null,
  event_id text not null references public.dueling_tournament_records(id),
  fingerprint text not null,
  primary key (actor_id, operation_id)
);
-- Installation preserves counters. Only the explicit test reset clears fixtures.
create table if not exists public.dueling_tournament_rate_buckets (
  bucket_key text primary key,
  window_start timestamptz not null,
  hits integer not null
);
create table if not exists public.dueling_tournament_registration_cooldowns (
  event_id text not null references public.dueling_tournament_records(id),
  actor_id text not null,
  rejoin_after timestamptz not null,
  primary key(event_id,actor_id)
);

-- Durable history is separate from the bounded working snapshot.
create table if not exists public.dueling_tournament_history (
  event_id text not null references public.dueling_tournament_records(id) on delete cascade,
  kind text not null check (kind in ('audit','draws','notices','announcements')),
  item_id text not null,
  sequence bigint generated always as identity,
  payload jsonb not null,
  primary key(event_id,kind,item_id)
);
create index if not exists dueling_history_page on public.dueling_tournament_history(event_id,kind,sequence desc);
create table if not exists public.dueling_tournament_notice_reads (
  event_id text not null references public.dueling_tournament_records(id) on delete cascade,
  notice_id text not null,
  user_id text not null,
  read_at timestamptz not null default now(),
  primary key(event_id,notice_id,user_id)
);


create or replace function public.dueling_tournament_grant_lock()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op <> 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('dueling-director:' || old.user_id, 0));
  end if;
  if tg_op <> 'DELETE' then
    perform pg_advisory_xact_lock(hashtextextended('dueling-director:' || new.user_id, 0));
    return new;
  end if;
  return old;
end $$;
drop trigger if exists dueling_director_lock on public.dueling_tournament_directors;
create trigger dueling_director_lock before insert or update or delete on public.dueling_tournament_directors
for each row execute function public.dueling_tournament_grant_lock();

create index if not exists dueling_rate_window on public.dueling_tournament_rate_buckets(window_start);

create or replace function public.dueling_tournament_rate_check(p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_hits integer; v_window timestamptz := date_trunc('minute', clock_timestamp()); v_key text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 or p_key is null or length(p_key) > 200
    or p_key !~ '^(request|write|notice):.+' then
    raise exception using errcode = 'PT422', message = 'Invalid rate-limit input.';
  end if;
  -- Fixed counter slots, not a shared capacity rejection. Each namespace has
  -- 65,536 reusable rows. Public identities cannot consume write/notice slots.
  -- Hash collisions share a quota only in their slot, never a global cutoff.
  v_key := split_part(p_key,':',1) || ':' || (hashtextextended(p_key,0) & 65535)::text;
  insert into public.dueling_tournament_rate_buckets as b values(v_key,v_window,1)
    on conflict(bucket_key) do update set
      window_start=excluded.window_start,
      hits=case when b.window_start<>excluded.window_start then 1 else b.hits+1 end
    where b.window_start<>excluded.window_start or b.hits<p_limit
    returning hits into v_hits;
  -- Only the selected row is locked. Rejected hits do not extend the window.
  return v_hits is not null;
end $$;

create or replace function public.dueling_tournament_capabilities(p_actor_id text)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'director', exists(select 1 from public.dueling_tournament_directors where user_id = p_actor_id),
    'referee', exists(select 1 from public.dueling_tournament_records where state->'refereeIds' ? p_actor_id)
  );
$$;

create or replace function public.dueling_tournament_get(p_locator text, p_actor_id text)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select state || jsonb_build_object('notices', coalesce((select jsonb_agg(item || jsonb_build_object('readAt',coalesce(to_jsonb(r.read_at),item->'readAt'))) from jsonb_array_elements(state->'notices') item left join public.dueling_tournament_notice_reads r on r.event_id=id and r.notice_id=item->>'id' and r.user_id=p_actor_id), '[]'::jsonb)) as state from public.dueling_tournament_records
  where (id = p_locator or slug = p_locator)
    and ((state->>'published')::boolean or state->'refereeIds' ? p_actor_id
      or exists(select 1 from public.dueling_tournament_directors where user_id = p_actor_id))
  order by (id = p_locator) desc limit 1;
$$;

create or replace function public.dueling_tournament_list(p_actor_id text, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(records.state), '[]'::jsonb) from (
    select state from public.dueling_tournament_records
    where state->'published' = 'true'::jsonb or state->'refereeIds' ? p_actor_id
      or exists(select 1 from public.dueling_tournament_directors where user_id = p_actor_id)
    order by (state->'featured' = 'true'::jsonb) desc, state->>'createdAt' desc, id
    limit 20 offset greatest(0, least(p_offset, 10000))
  ) records;
$$;

create or replace function public.dueling_tournament_history_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then raise exception using errcode='PT422',message='Tournament history is append-only.'; end if;
  if (new.event_id,new.kind,new.item_id,new.sequence) is distinct from (old.event_id,old.kind,old.item_id,old.sequence) then
    raise exception using errcode='PT422',message='History identity cannot change.';
  end if;
  if old.kind <> 'draws' then
    if new.payload is distinct from old.payload then raise exception using errcode='PT422',message='Tournament history is immutable.'; end if;
  elsif (new.payload - array['revealedAt','voidReason']) is distinct from (old.payload - array['revealedAt','voidReason'])
    or (old.payload->>'revealedAt' is not null and new.payload is distinct from old.payload)
    or (old.payload->>'voidReason' is not null and new.payload is distinct from old.payload)
    or (new.payload->>'revealedAt' is not null and new.payload->>'voidReason' is not null) then
    raise exception using errcode='PT422',message='A committed draw can only be revealed or voided once; its proof is immutable.';
  end if;
  return new;
end $$;
drop trigger if exists dueling_history_guard on public.dueling_tournament_history;
create trigger dueling_history_guard before update or delete on public.dueling_tournament_history
for each row execute function public.dueling_tournament_history_guard();

create or replace function public.dueling_tournament_validate_delta(p_old jsonb,p_new jsonb,p_command text,p_actor text)
returns void language plpgsql set search_path=pg_catalog,public as $$
declare
  v_allowed text[]; v_match text := p_new #>> '{audit,-1,matchId}';
  v_entry text := p_new #>> '{audit,-1,details,entryId}';
  v_old_notices jsonb; v_prefix jsonb; v_new_notices jsonb; v_recipient text;
  v_old_fixture jsonb; v_new_fixture jsonb; v_fixture_fields text[];
begin
  v_allowed := case p_command
    when 'settings' then array['settings']
    when 'rules' then array['rules']
    when 'publish' then array['published','featured']
    when 'registration_state' then array['phase','entries']
    when 'register' then array['entries'] when 'withdraw' then array['entries']
    when 'check_in' then array['entries'] when 'promote' then array['entries']
    when 'seeds' then array['entries','seedOrder','fixtures']
    when 'draw' then array['draws']
    when 'reveal_draw' then array['draws','seedOrder','entries']
    when 'void_draw' then array['draws','seedOrder','entries','announcements']
    when 'publish_bracket' then array['fixtures','phase','bracketSize']
    when 'pause' then array['paused','pauseReason','pauseSource']
    when 'staff' then array['refereeIds']
    when 'announcement' then array['announcements']
    when 'start_match' then array['fixtures'] when 'hold_match' then array['fixtures']
    when 'schedule_match' then array['fixtures']
    when 'result' then array['fixtures','entries','phase','paused','pauseReason','pauseSource']
    when 'resolve_absence' then array['fixtures','entries','phase','paused','pauseReason','pauseSource']
    when 'correct_result' then array['fixtures','entries','phase','paused','pauseReason','pauseSource']
    when 'reopen_match' then array['fixtures','entries','phase','paused','pauseReason','pauseSource','completionReason']
    when 'entry_status' then array['entries'] when 'restore_entry' then array['entries']
    when 'finish_without_champion' then array['phase','paused','pauseReason','pauseSource','completionReason','announcements']
    when 'cancel' then array['phase','paused','pauseReason','announcements']
    else null end;
  if v_allowed is null then raise exception using errcode='PT422',message='Unknown tournament command.'; end if;
  v_allowed := v_allowed || array['revision','updatedAt','audit','receipts','notices'];
  if (p_old - v_allowed) is distinct from (p_new - v_allowed) then
    raise exception using errcode='PT422',message='Command changed unrelated tournament fields.';
  end if;
  if ((p_new->'audit') - (jsonb_array_length(p_new->'audit') - 1)) is distinct from p_old->'audit'
    or p_new #>> '{audit,-1,action}' is distinct from p_command then
    raise exception using errcode='PT422',message='Existing audit history cannot be rewritten.';
  end if;
  -- Snapshots retain the entire previous notice prefix until compaction happens
  -- below. Acknowledgements are independent and cannot rewrite notice content.
  select coalesce(jsonb_agg(n - 'readAt' order by ordinal),'[]'::jsonb) into v_old_notices
    from jsonb_array_elements(p_old->'notices') with ordinality as rows(n,ordinal);
  select coalesce(jsonb_agg(n - 'readAt' order by ordinal),'[]'::jsonb) into v_prefix
    from jsonb_array_elements(p_new->'notices') with ordinality as rows(n,ordinal)
    where ordinal<=jsonb_array_length(p_old->'notices');
  if v_prefix is distinct from v_old_notices then
    raise exception using errcode='PT422',message='Existing notices cannot be removed or rewritten.';
  end if;
  select coalesce(jsonb_agg(n order by ordinal),'[]'::jsonb) into v_new_notices
    from jsonb_array_elements(p_new->'notices') with ordinality as rows(n,ordinal)
    where ordinal>jsonb_array_length(p_old->'notices');
  if jsonb_array_length(v_new_notices)>0 and p_command not in (
    'register','withdraw','promote','entry_status','restore_entry','reveal_draw','publish_bracket',
    'result','correct_result','reopen_match','resolve_absence','start_match','hold_match','schedule_match','pause') then
    raise exception using errcode='PT422',message='This command cannot append notices.';
  end if;
  if p_command in ('register','withdraw') then v_recipient:=p_actor;
  elsif p_command in ('entry_status','restore_entry') then
    select e->>'userId' into v_recipient from jsonb_array_elements(p_new->'entries') e where e->>'id'=v_entry;
  elsif p_command='promote' then
    select n->>'userId' into v_recipient from jsonb_array_elements(p_new->'entries') n
      join jsonb_array_elements(p_old->'entries') o on o->>'id'=n->>'id'
      where o->>'status'='waitlisted' and n->>'status'='registered';
  end if;
  -- At 32 players publication emits 32 opponent notices + 2 on-deck notices.
  -- The cap reserves six additional notices; reveal emits at most 32.
  if jsonb_array_length(v_new_notices)>40 or exists (
    select 1 from jsonb_array_elements(v_new_notices) n
    where n->>'id' is null or n->>'readAt' is not null
      or n->>'createdAt' is distinct from p_new->>'updatedAt'
      or not exists(select 1 from jsonb_array_elements(p_new->'entries') e where e->>'userId'=n->>'userId')
      or (p_command in ('register','withdraw','promote','entry_status','restore_entry') and n->>'userId' is distinct from v_recipient)
      or exists(select 1 from jsonb_array_elements(p_old->'notices') old_n where old_n->>'id'=n->>'id')
      or exists(select 1 from public.dueling_tournament_history h where h.event_id=p_old->>'id' and h.kind='notices' and h.item_id=n->>'id')
  ) or (select count(*)<>count(distinct n->>'id') from jsonb_array_elements(v_new_notices) n) then
    raise exception using errcode='PT422',message='Invalid appended notices for this command.';
  end if;
  if p_command in ('register','withdraw','check_in') then
    if (select coalesce(jsonb_agg(e order by e->>'id'),'[]'::jsonb) from jsonb_array_elements(p_old->'entries') e where e->>'userId'<>p_actor)
      is distinct from (select coalesce(jsonb_agg(e order by e->>'id'),'[]'::jsonb) from jsonb_array_elements(p_new->'entries') e where e->>'userId'<>p_actor) then
      raise exception using errcode='PT422',message='A participant command cannot alter another account.';
    end if;
  end if;
  if p_command in ('entry_status','restore_entry') then
    if v_entry is null or not exists(select 1 from jsonb_array_elements(p_old->'entries') e where e->>'id'=v_entry)
      or (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(p_old->'entries') e where e->>'id'<>v_entry)
        is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(p_new->'entries') e where e->>'id'<>v_entry) then
      raise exception using errcode='PT422',message='Only the named player can change in an availability ruling.';
    end if;
    if (select e - array['status','unavailableFromMatchId','availabilityBeforeRuling'] from jsonb_array_elements(p_old->'entries') e where e->>'id'=v_entry)
      is distinct from (select e - array['status','unavailableFromMatchId','availabilityBeforeRuling'] from jsonb_array_elements(p_new->'entries') e where e->>'id'=v_entry) then
      raise exception using errcode='PT422',message='An availability ruling can only change the selected player status.';
    end if;
  end if;
  if p_command <> 'register' and (select jsonb_agg(e - array['status','seed','checkedInAt','unavailableFromMatchId','availabilityBeforeRuling','reregisterAfter'] order by e->>'id') from jsonb_array_elements(p_old->'entries') e)
    is distinct from (select jsonb_agg(e - array['status','seed','checkedInAt','unavailableFromMatchId','availabilityBeforeRuling','reregisterAfter'] order by e->>'id') from jsonb_array_elements(p_new->'entries') e) then
    raise exception using errcode='PT422',message='Player identity cannot change through this command.';
  end if;
  if p_command in ('start_match','hold_match','schedule_match','resolve_absence') then
    select f into v_old_fixture from jsonb_array_elements(p_old->'fixtures') f where f->>'id'=v_match;
    select f into v_new_fixture from jsonb_array_elements(p_new->'fixtures') f where f->>'id'=v_match;
    v_fixture_fields:=case p_command when 'start_match' then array['startedAt']
      when 'hold_match' then array['held','holdReason'] when 'schedule_match' then array['scheduledAt']
      else case when p_new #>> '{audit,-1,details,outcome}'='resume' then array['held','holdReason']
        else array['result','held','holdReason'] end end;
    if v_old_fixture is null or v_new_fixture is null
      or (v_old_fixture-v_fixture_fields) is distinct from (v_new_fixture-v_fixture_fields)
      or (p_command='resolve_absence' and (v_old_fixture->>'result' is not null or v_old_fixture->'held' is distinct from 'true'::jsonb)) then
      raise exception using errcode='PT422',message='Invalid selected fixture change for this command.';
    end if;
  end if;
  if p_command in ('result','resolve_absence','start_match','hold_match','schedule_match') and
    (select jsonb_agg(f order by f->>'id') from jsonb_array_elements(p_old->'fixtures') f where f->>'id'<>v_match)
      is distinct from (select jsonb_agg(f order by f->>'id') from jsonb_array_elements(p_new->'fixtures') f where f->>'id'<>v_match) then
    raise exception using errcode='PT422',message='Only the selected fixture can change.';
  end if;
  if p_command not in ('seeds','publish_bracket') and
    (select jsonb_agg(f - array['result','startedAt','scheduledAt','held','holdReason'] order by f->>'id') from jsonb_array_elements(p_old->'fixtures') f)
      is distinct from (select jsonb_agg(f - array['result','startedAt','scheduledAt','held','holdReason'] order by f->>'id') from jsonb_array_elements(p_new->'fixtures') f) then
    raise exception using errcode='PT422',message='Bracket dependencies cannot change through this command.';
  end if;
end $$;

create or replace function public.dueling_tournament_compact(p_state jsonb)
returns jsonb language plpgsql set search_path = pg_catalog, public as $$
declare v_kind text; v_limit integer; v_items jsonb;
begin
  foreach v_kind in array array['audit','draws','notices','announcements'] loop
    insert into public.dueling_tournament_history(event_id,kind,item_id,payload)
      select p_state->>'id',v_kind,item->>'id',case when v_kind='notices' then jsonb_set(item,'{readAt}','null'::jsonb) else item end from jsonb_array_elements(p_state->v_kind) item
      on conflict(event_id,kind,item_id) do update set payload=excluded.payload
      where dueling_tournament_history.payload is distinct from excluded.payload;
    v_limit := case v_kind when 'audit' then 100 when 'draws' then 20 when 'notices' then 200 else 50 end;
    select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb) into v_items from (
      select item,ordinal from jsonb_array_elements(p_state->v_kind) with ordinality items(item,ordinal)
      order by ordinal desc limit v_limit
    ) recent;
    p_state := jsonb_set(p_state,array[v_kind],v_items);
  end loop;
  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb) into v_items from (
    select item,ordinal from jsonb_array_elements(p_state->'receipts') with ordinality items(item,ordinal)
    order by ordinal desc limit 64
  ) recent;
  return jsonb_set(p_state,'{receipts}',v_items);
end $$;

create or replace function public.dueling_tournament_ack(p_event_id text,p_actor_id text,p_notice_id text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not exists(select 1 from public.dueling_tournament_records r where r.id=p_event_id and (r.state->>'published')::boolean and (
      exists(select 1 from jsonb_array_elements(r.state->'notices') item where item->>'id'=p_notice_id and item->>'userId'=p_actor_id)
      or exists(select 1 from public.dueling_tournament_history h where h.event_id=r.id and h.kind='notices' and h.item_id=p_notice_id and h.payload->>'userId'=p_actor_id))) then
    raise exception using errcode='PT404', message='Notice not found.';
  end if;
  if not public.dueling_tournament_rate_check('notice:' || p_actor_id,120) then raise exception using errcode='PT429',message='Too many notice operations.'; end if;
  insert into public.dueling_tournament_notice_reads(event_id,notice_id,user_id) values(p_event_id,p_notice_id,p_actor_id)
    on conflict do nothing;
end $$;

create or replace function public.dueling_tournament_receipt(p_actor_id text,p_operation_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('eventId',event_id,'fingerprint',fingerprint) from public.dueling_tournament_operations where actor_id=p_actor_id and operation_id=p_operation_id;
$$;

create or replace function public.dueling_tournament_history_page(p_event_id text,p_actor_id text,p_kind text,p_before bigint default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_state jsonb; v_items jsonb;
begin
  v_state := public.dueling_tournament_get(p_event_id,p_actor_id);
  if v_state is null then raise exception using errcode='PT404',message='Tournament not found.'; end if;
  if p_kind not in ('audit','draws','notices','announcements') or (p_kind='audit' and not exists(select 1 from public.dueling_tournament_directors where user_id=p_actor_id)) or (p_kind='notices' and p_actor_id is null) then
    raise exception using errcode='PT403',message='History access is not allowed.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('cursor',h.sequence::text,'item',case when p_kind='notices' then h.payload || jsonb_build_object('readAt',coalesce(to_jsonb(r.read_at),h.payload->'readAt')) else h.payload end) order by h.sequence desc),'[]'::jsonb)
  into v_items from (
    select * from public.dueling_tournament_history where event_id=p_event_id and kind=p_kind and (p_before is null or sequence<p_before)
      and (p_kind<>'notices' or payload->>'userId'=p_actor_id) order by sequence desc limit 50
  ) h left join public.dueling_tournament_notice_reads r on r.event_id=h.event_id and r.notice_id=h.item_id and r.user_id=p_actor_id;
  return v_items;
end $$;

create or replace function public.dueling_tournament_validate(p_state jsonb)
returns void language plpgsql set search_path = pg_catalog, public as $$
declare v_total integer; v_distinct integer; v_capacity integer; v_size integer;
begin
  if jsonb_typeof(p_state) <> 'object' or jsonb_typeof(p_state->'entries') <> 'array'
    or jsonb_typeof(p_state->'fixtures') <> 'array' or octet_length(p_state::text) > 4000000 then
    raise exception using errcode = 'PT422', message = 'Invalid tournament record.';
  end if;
  v_capacity := (p_state #>> '{settings,capacity}')::integer;
  if v_capacity is null or v_capacity not between 4 and 32 then
    raise exception using errcode = 'PT422', message = 'Tournament capacity must be between 4 and 32.';
  end if;
  select count(*), count(distinct item->>'userId') into v_total, v_distinct from jsonb_array_elements(p_state->'entries') item;
  if v_total <> v_distinct or v_total > 1000 then
    raise exception using errcode = 'PT422', message = 'Duplicate or excessive participant registrations.';
  end if;
  select count(distinct item->>'id') into v_distinct from jsonb_array_elements(p_state->'entries') item;
  if v_total <> v_distinct then
    raise exception using errcode = 'PT422', message = 'Duplicate participant identifier.';
  end if;
  if (select count(*) from jsonb_array_elements(p_state->'entries') item where item->>'status' in ('registered','checked_in')) > v_capacity then
    raise exception using errcode = 'PT409', message = 'Tournament capacity was exceeded.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_state->'entries') item where item->>'status' in ('registered','checked_in','waitlisted') group by lower(item->>'alias') having count(*) > 1) then
    raise exception using errcode = 'PT409', message = 'Another active entrant is using this alias. Resolve the duplicate alias before retrying.';
  end if;
  if (select count(*) from jsonb_array_elements(p_state->'fixtures') item where item->>'startedAt' is not null and item->>'result' is null) > 1 then
    raise exception using errcode = 'PT409', message = 'Only one arena match may be active.';
  end if;
  select count(*), count(distinct item->>'id') into v_total, v_distinct from jsonb_array_elements(p_state->'fixtures') item;
  if v_total <> v_distinct or v_total > 63 then
    raise exception using errcode = 'PT422', message = 'Invalid fixture identifiers.';
  end if;
  v_size := coalesce((p_state->>'bracketSize')::integer,16);
  if v_size not in (4,8,16,32)
    or jsonb_array_length(p_state->'seedOrder')>32
    or (v_total>0 and (v_total<>2*v_size-1 or jsonb_array_length(p_state->'seedOrder') not between 4 and v_size))
    or exists(select 1 from jsonb_array_elements(p_state->'entries') e where (e->>'seed')::integer not between 1 and 32)
    or exists(select 1 from jsonb_array_elements(p_state->'fixtures') f, jsonb_array_elements(f->'sources') s where s->>'kind'='seed' and (s->>'seed')::integer not between 1 and v_size)
    or exists(select 1 from jsonb_array_elements(p_state->'draws') d where jsonb_array_length(d->'entrants') not between 4 and 32 or jsonb_array_length(d->'order') not between 4 and 32)
  then
    raise exception using errcode='PT422',message='Invalid bracket size, seeds or draw field.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_state->'entries') item where item->>'seed' is not null group by item->>'seed' having count(*) > 1) then
    raise exception using errcode = 'PT422', message = 'Duplicate tournament seed.';
  end if;
end $$;

-- Resolve an existing source for database invariant checks, not bracket generation.
-- '#pending' is distinct from a resolved empty slot (SQL null).
create or replace function public.dueling_tournament_source(p_state jsonb, p_source jsonb, p_depth integer default 0)
returns text language plpgsql set search_path = pg_catalog, public as $$
declare v_fixture jsonb; v_a text; v_b text; v_winner text;
begin
  if p_depth > 40 then raise exception using errcode = 'PT422', message = 'Cyclic bracket dependencies.'; end if;
  if p_source->>'kind' = 'seed' then return p_state->'seedOrder'->>((p_source->>'seed')::integer - 1); end if;
  select item into v_fixture from jsonb_array_elements(p_state->'fixtures') item where item->>'id' = p_source->>'matchId';
  if v_fixture is null then raise exception using errcode = 'PT422', message = 'Unknown fixture dependency.'; end if;
  v_a := public.dueling_tournament_source(p_state, v_fixture->'sources'->0, p_depth + 1);
  v_b := public.dueling_tournament_source(p_state, v_fixture->'sources'->1, p_depth + 1);
  if v_a = '#pending' or v_b = '#pending' then return '#pending'; end if;
  if v_a is null or v_b is null then
    return case when p_source->>'kind' = 'winner' then coalesce(v_a, v_b) else null end;
  end if;
  if v_fixture->>'result' is null then return '#pending'; end if;
  if v_fixture #>> '{result,kind}' = 'double_forfeit' then return null; end if;
  v_winner := v_fixture #>> '{result,winnerId}';
  if p_source->>'kind' = 'winner' then return v_winner; end if;
  return case when v_winner = v_a then v_b else v_a end;
end $$;

create or replace function public.dueling_tournament_create(p_actor_id text, p_operation_id uuid, p_fingerprint text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_receipt public.dueling_tournament_operations; v_state jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('dueling-director:' || p_actor_id, 0));
  if not exists(select 1 from public.dueling_tournament_directors where user_id = p_actor_id) then
    raise exception using errcode = 'PT403', message = 'Tournament director access is required.';
  end if;
  select * into v_receipt from public.dueling_tournament_operations where actor_id = p_actor_id and operation_id = p_operation_id;
  if found then
    if v_receipt.fingerprint <> p_fingerprint then raise exception using errcode = 'PT409', message = 'Operation identifier already used.'; end if;
    select state into v_state from public.dueling_tournament_records where id = v_receipt.event_id;
    return v_state;
  end if;
  if not public.dueling_tournament_rate_check('write:' || p_actor_id, 120) then raise exception using errcode='PT429',message='Too many tournament operations.'; end if;
  perform public.dueling_tournament_validate(p_state);
  if p_state->>'phase' <> 'draft' or (p_state->>'revision')::bigint <> 0 or (p_state->>'published')::boolean or (p_state->>'featured')::boolean then
    raise exception using errcode = 'PT422', message = 'Create a draft tournament first.';
  end if;
  insert into public.dueling_tournament_records(id, slug, revision, state) values(p_state->>'id', p_state #>> '{settings,slug}', 0, p_state);
  insert into public.dueling_tournament_operations values(p_actor_id, p_operation_id, p_state->>'id', p_fingerprint);
  return p_state;
exception when unique_violation then
  raise exception using errcode = 'PT409', message = 'That tournament slug or operation already exists.';
end $$;

create or replace function public.dueling_tournament_commit(p_actor_id text, p_event_id text, p_expected_revision bigint, p_operation_id uuid, p_fingerprint text, p_command_type text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_compacted jsonb;
  v_record public.dueling_tournament_records; v_receipt public.dueling_tournament_operations;
  v_director boolean; v_referee boolean; v_fixture jsonb; v_result jsonb;
  v_match_id text; v_a text; v_b text; v_winner text; v_other public.dueling_tournament_records;
begin
  perform pg_advisory_xact_lock(hashtextextended('dueling-director:' || p_actor_id, 0));
  if p_command_type = 'publish' then perform pg_advisory_xact_lock(hashtextextended('dueling-featured', 0)); end if;
  select * into v_record from public.dueling_tournament_records where id = p_event_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Tournament not found.'; end if;
  select exists(select 1 from public.dueling_tournament_directors where user_id = p_actor_id) into v_director;
  v_referee := v_record.state->'refereeIds' ? p_actor_id;
  if not v_director and not (v_referee and p_command_type in ('start_match','hold_match','schedule_match','result','entry_status'))
    and not (p_command_type in ('register','withdraw','check_in','notice_read') and (v_record.state->>'published')::boolean) then
    raise exception using errcode = 'PT403', message = 'This operation is not allowed for your tournament role.';
  end if;
  select * into v_receipt from public.dueling_tournament_operations where actor_id = p_actor_id and operation_id = p_operation_id;
  if found then
    if v_receipt.fingerprint <> p_fingerprint or v_receipt.event_id <> p_event_id then raise exception using errcode = 'PT409', message = 'Operation identifier already used.'; end if;
    return v_record.state;
  end if;
  if not public.dueling_tournament_rate_check('write:' || p_actor_id, 120) then raise exception using errcode='PT429',message='Too many tournament operations.'; end if;
  if v_record.revision <> p_expected_revision then raise exception using errcode = 'PT409', message = 'The tournament changed. Refresh before trying again.'; end if;
  if p_state->>'id' <> p_event_id or (p_state->>'revision')::bigint <> v_record.revision + 1
    or jsonb_array_length(p_state->'audit') <> jsonb_array_length(v_record.state->'audit') + 1
    or p_state #>> '{audit,-1,actorId}' <> p_actor_id or p_state #>> '{audit,-1,id}' <> p_operation_id::text then
    raise exception using errcode = 'PT422', message = 'Invalid tournament revision or audit record.';
  end if;
  perform public.dueling_tournament_validate(p_state);
  perform public.dueling_tournament_validate_delta(v_record.state,p_state,p_command_type,p_actor_id);
  if p_command_type='register' and exists(
    select 1 from public.dueling_tournament_registration_cooldowns
    where event_id=p_event_id and actor_id=p_actor_id and rejoin_after>clock_timestamp()
  ) then raise exception using errcode='PT429',message='Please wait five minutes after withdrawing before registering again.'; end if;
  if p_command_type='withdraw' then
    insert into public.dueling_tournament_registration_cooldowns values(p_event_id,p_actor_id,clock_timestamp()+interval '5 minutes')
      on conflict(event_id,actor_id) do update set rejoin_after=excluded.rejoin_after;
  end if;
  if p_command_type in ('result','correct_result') or (p_command_type='resolve_absence' and p_state #>> '{audit,-1,details,outcome}'='eliminate_both') then
    v_match_id := p_state #>> '{audit,-1,matchId}';
    select item into v_fixture from jsonb_array_elements(v_record.state->'fixtures') item where item->>'id' = v_match_id;
    select item->'result' into v_result from jsonb_array_elements(p_state->'fixtures') item where item->>'id' = v_match_id;
    if p_command_type<>'correct_result' and v_fixture->>'result' is not null then
      raise exception using errcode='PT422',message='This match already has a result. Use a director correction.';
    end if;
    if p_command_type='correct_result' and v_fixture->>'result' is null then
      raise exception using errcode='PT422',message='There is no official result to correct.';
    end if;
    v_a := public.dueling_tournament_source(v_record.state, v_fixture->'sources'->0);
    v_b := public.dueling_tournament_source(v_record.state, v_fixture->'sources'->1);
    v_winner := v_result->>'winnerId';
    if v_fixture is null or v_result is null or v_a is null or v_b is null or v_a = '#pending' or v_b = '#pending' then
      raise exception using errcode = 'PT422', message = 'Both match opponents must be resolved.';
    end if;
    if v_result->>'kind' <> 'double_forfeit' and (v_winner is null or v_winner not in (v_a,v_b)) then
      raise exception using errcode = 'PT422', message = 'The winner must be an opponent in this fixture.';
    end if;
    if v_result->>'kind' = 'played' and not (
      (v_winner = v_a and (v_result->>'scoreA')::integer = 3 and (v_result->>'scoreB')::integer between 0 and 2)
      or (v_winner = v_b and (v_result->>'scoreB')::integer = 3 and (v_result->>'scoreA')::integer between 0 and 2)) then
      raise exception using errcode = 'PT422', message = 'Invalid BO5 result.';
    end if;
  end if;
    if p_command_type in ('correct_result','reopen_match') and exists (
      with recursive edges(parent,child) as (
        select source->>'matchId', fixture->>'id' from jsonb_array_elements(v_record.state->'fixtures') fixture, jsonb_array_elements(fixture->'sources') source where source->>'kind' <> 'seed'
        union select 'GF1','GF2'
      ), affected(id) as (
        select child from edges where parent = p_state #>> '{audit,-1,matchId}'
        union select edges.child from edges join affected on edges.parent = affected.id
      ) select 1 from affected join jsonb_array_elements(v_record.state->'fixtures') fixture on fixture->>'id' = affected.id
      where fixture->>'startedAt' is not null or fixture->>'result' is not null
    ) then raise exception using errcode = 'PT409', message = 'Correction blocked because downstream play has started.'; end if;
  if p_command_type = 'publish' and (p_state->>'featured')::boolean then
    for v_other in select * from public.dueling_tournament_records where id <> p_event_id and (state->>'featured')::boolean for update loop
      update public.dueling_tournament_records set revision = v_other.revision + 1,
        state = jsonb_set(jsonb_set(jsonb_set(v_other.state, '{featured}', 'false'::jsonb), '{revision}', to_jsonb(v_other.revision + 1)), '{audit}', (v_other.state->'audit') || jsonb_build_array(jsonb_build_object(
          'id', p_operation_id::text || ':unfeatured', 'actorId', p_actor_id, 'action', 'unfeatured', 'at', p_state->>'updatedAt', 'revision', v_other.revision + 1,
          'reason', 'Another event was featured.', 'matchId', null, 'previousResult', null, 'details', '{}'::jsonb)))
        where id = v_other.id;
      update public.dueling_tournament_records set state = public.dueling_tournament_compact(state) where id = v_other.id;
    end loop;
  end if;
  v_compacted := public.dueling_tournament_compact(p_state);
  update public.dueling_tournament_records set slug = p_state #>> '{settings,slug}', revision = v_record.revision + 1, state = v_compacted where id = p_event_id;
  insert into public.dueling_tournament_operations values(p_actor_id,p_operation_id,p_event_id,p_fingerprint);
  return v_compacted;
exception when unique_violation then
  raise exception using errcode = 'PT409', message = 'That tournament slug or operation already exists.';
end $$;

-- Grant only the server runtime access. Browser roles must never call these RPCs.
do $$
declare obj record; role_name text;
begin
  foreach role_name in array array['anon','authenticated','dueling_test_runtime','dueling_test_anon'] loop
    if not exists(select 1 from pg_roles where rolname=role_name) then execute format('create role %I login',role_name); end if;
  end loop;
  for obj in select tablename from pg_tables where schemaname='public' and tablename like 'dueling_tournament_%' loop
    execute format('alter table public.%I enable row level security',obj.tablename);
    execute format('revoke all on table public.%I from public, anon, authenticated, dueling_test_anon, dueling_test_runtime',obj.tablename);
  end loop;
  for obj in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dueling_tournament_%' loop
    execute format('revoke all on function %s from public, anon, authenticated, dueling_test_anon, dueling_test_runtime',obj.signature);
  end loop;
end $$;
grant usage on schema public to dueling_test_runtime, dueling_test_anon, anon, authenticated;
grant execute on function public.dueling_tournament_rate_check(text,integer), public.dueling_tournament_capabilities(text), public.dueling_tournament_get(text,text), public.dueling_tournament_list(text,integer), public.dueling_tournament_create(text,uuid,text,jsonb), public.dueling_tournament_commit(text,text,bigint,uuid,text,text,jsonb), public.dueling_tournament_ack(text,text,text), public.dueling_tournament_receipt(text,uuid), public.dueling_tournament_history_page(text,text,text,bigint) to dueling_test_runtime;
commit;
