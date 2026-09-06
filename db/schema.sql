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
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (player_id, game_id)
);

create index if not exists picks_game_idx on picks (game_id);

-- The Lock and the Upset are weekly selections in their own right, not flags on
-- a spread pick: a player may Lock a team without having taken that game
-- against the number. The primary key is what enforces one of each per week,
-- which the old trigger on picks used to do.
create table if not exists weekly_bonuses (
  player_id     text not null references players (id) on delete cascade,
  season        int  not null,
  week          int  not null,
  kind          text not null check (kind in ('lock', 'upset')),
  game_id       text not null references games (id) on delete cascade,
  side          text not null check (side in ('home', 'away')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (player_id, season, week, kind)
);

create index if not exists weekly_bonuses_game_idx on weekly_bonuses (game_id);

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
