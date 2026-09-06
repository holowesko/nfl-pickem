-- Profile photos, one per player.
--
-- Run this once against the live database (Neon SQL Editor). Safe to run twice.
--
-- The image is kept as base64 text rather than bytea because the same schema
-- has to work through both the Neon HTTP driver and PGlite, and text behaves
-- identically on both. Photos are resized to 192px square in the browser
-- before upload, so a row is a few kilobytes, not megabytes.

create table if not exists player_avatars (
  player_id    text primary key references players (id) on delete cascade,
  data_base64  text not null,
  mime         text not null,
  updated_at   timestamptz not null default now()
);
