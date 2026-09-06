-- Lock and Upset become weekly selections in their own right, rather than flags
-- on a spread pick.
--
-- Run this once against the live database (Neon SQL Editor). It is safe to run
-- twice. Applying it before Week 1 costs nothing; after picks exist it would
-- discard any Lock/Upset already set, so do it now rather than mid-season.

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

-- The trigger and columns these replace.
drop trigger if exists picks_one_lock_and_upset on picks;
drop function if exists assert_one_lock_and_upset();

alter table picks drop column if exists is_lock;
alter table picks drop column if exists is_upset;
