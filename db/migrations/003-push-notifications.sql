-- Web push: who to notify, and what has already been said.
--
-- Run once against the live database (Neon SQL Editor). Safe to run twice.

-- One row per browser that has granted permission. A player with a phone and a
-- laptop has two; the endpoint is the browser's own address for its push
-- service and is the natural key.
create table if not exists push_subscriptions (
  endpoint    text primary key,
  player_id   text not null references players (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_player_idx
  on push_subscriptions (player_id);

-- Live entries are recomputed constantly, so without this a Lock being buried
-- would notify on every poll until the game ended. The key carries the season
-- and week, so the same story can recur next Sunday.
create table if not exists announced_entries (
  key           text primary key,
  announced_at  timestamptz not null default now()
);
