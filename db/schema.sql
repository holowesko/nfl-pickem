-- Schema for the family NFL pick'em pool.
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql

create table if not exists players (
  id            text primary key,          -- 'dad', 'john', 'nick'
  name          text not null,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists games (
  id            text primary key,          -- ESPN event id
  season        int  not null,
  week          int  not null,
  kickoff       timestamptz not null,
  home_team     text not null,             -- abbreviation, e.g. 'KC'
  away_team     text not null,
  home_name     text not null,             -- display name, e.g. 'Chiefs'
  away_name     text not null,

  -- Live line, from the home team's perspective: -3 means home favored by 3.
  spread_home        numeric(4,1),
  spread_updated_at  timestamptz,

  -- The line that actually grades the pick: the last snapshot taken at or
  -- before this game's lock time. Written once the lock window closes.
  locked_spread_home numeric(4,1),
  spread_locked_at   timestamptz,

  home_score    int,
  away_score    int,
  final         boolean not null default false,

  updated_at    timestamptz not null default now()
);

create index if not exists games_season_week_idx on games (season, week);
create index if not exists games_kickoff_idx on games (kickoff);

-- Every observation of a line, so the graded number never depends on a cron
-- job firing at an exact minute. The snapshot closest to (but not after) the
-- lock time becomes locked_spread_home.
create table if not exists line_snapshots (
  id            bigserial primary key,
  game_id       text not null references games (id) on delete cascade,
  spread_home   numeric(4,1) not null,
  captured_at   timestamptz not null default now()
);

create index if not exists line_snapshots_game_time_idx
  on line_snapshots (game_id, captured_at desc);

create table if not exists picks (
  player_id     text not null references players (id) on delete cascade,
  game_id       text not null references games (id) on delete cascade,
  side          text not null check (side in ('home', 'away')),
  is_lock       boolean not null default false,
  is_upset      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (player_id, game_id)
);

create index if not exists picks_game_idx on picks (game_id);

-- At most one Lock and one Upset per player per week. Enforced in the database
-- as well as in the app, because the app is the only thing standing between
-- three competitive people and a rules argument in February.
create or replace function assert_one_lock_and_upset() returns trigger as $$
declare
  wk int;
  lock_count int;
  upset_count int;
begin
  select week into wk from games where id = new.game_id;

  select count(*) into lock_count
  from picks p join games g on g.id = p.game_id
  where p.player_id = new.player_id
    and g.week = wk
    and p.is_lock
    and p.game_id <> new.game_id;

  select count(*) into upset_count
  from picks p join games g on g.id = p.game_id
  where p.player_id = new.player_id
    and g.week = wk
    and p.is_upset
    and p.game_id <> new.game_id;

  if new.is_lock and lock_count > 0 then
    raise exception 'Only one Lock of the Week is allowed (week %)', wk;
  end if;

  if new.is_upset and upset_count > 0 then
    raise exception 'Only one Upset of the Week is allowed (week %)', wk;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists picks_one_lock_and_upset on picks;
create trigger picks_one_lock_and_upset
  before insert or update on picks
  for each row execute function assert_one_lock_and_upset();

-- Small key/value store for things like the current week override.
create table if not exists app_meta (
  key   text primary key,
  value text not null
);

insert into players (id, name, sort_order) values
  ('dad',  'Dad',  1),
  ('john', 'John', 2),
  ('nick', 'Nick', 3)
on conflict (id) do nothing;
