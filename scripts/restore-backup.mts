/**
 * Restores a snapshot from `backups/` into the database.
 *
 *   npx tsx scripts/restore-backup.mts [path]
 *
 * A backup you have never restored is a guess, not a backup. This is the other
 * half of the weekly export: it is what makes losing the Neon project a bad
 * afternoon rather than a lost season.
 *
 * Writes to whatever `DATABASE_URL` points at, so it refuses to touch a remote
 * database unless `--force` is passed. Without that env var it targets the local
 * PGlite copy, which is the normal case — and the dev server must be stopped
 * first, because only one process can hold that database open.
 *
 * Every write is an upsert, so restoring over existing rows is safe and
 * repeatable. It does not delete anything the snapshot lacks.
 */
import fs from 'node:fs'
import { db } from '../lib/db'

const path = process.argv.find((a) => a.endsWith('.json')) ?? 'backups/snapshot.json'
const force = process.argv.includes('--force')

if (process.env.DATABASE_URL && !force) {
  console.error(
    `\nDATABASE_URL is set, so this would write to the live database.\n` +
      `Re-run with --force if that is genuinely what you want.\n`
  )
  process.exit(1)
}

if (!fs.existsSync(path)) {
  console.error(`\nNo snapshot at ${path}\n`)
  process.exit(1)
}

const snapshot = JSON.parse(fs.readFileSync(path, 'utf8'))
const sql = await db()

console.log(`Restoring ${path} (exported ${snapshot.exportedAt})`)

for (const p of snapshot.players ?? []) {
  await sql`
    insert into players (id, name, sort_order) values (${p.id}, ${p.name}, ${p.sort_order})
    on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order
  `
}

for (const g of snapshot.games ?? []) {
  await sql`
    insert into games (
      id, season, week, kickoff, home_team, away_team, home_name, away_name,
      spread_home, locked_spread_home, spread_locked_at, home_score, away_score, final
    ) values (
      ${g.id}, ${g.season}, ${g.week}, ${g.kickoff}, ${g.home_team}, ${g.away_team},
      ${g.home_name}, ${g.away_name}, ${g.spread_home}, ${g.locked_spread_home},
      ${g.spread_locked_at}, ${g.home_score}, ${g.away_score}, ${g.final}
    )
    on conflict (id) do update set
      spread_home = excluded.spread_home,
      locked_spread_home = excluded.locked_spread_home,
      spread_locked_at = excluded.spread_locked_at,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      final = excluded.final
  `
}

for (const s of snapshot.lineSnapshots ?? []) {
  await sql`
    insert into line_snapshots (game_id, spread_home, captured_at)
    values (${s.game_id}, ${s.spread_home}, ${s.captured_at})
  `
}

for (const p of snapshot.picks ?? []) {
  await sql`
    insert into picks (player_id, game_id, side, created_at, updated_at)
    values (${p.player_id}, ${p.game_id}, ${p.side}, ${p.created_at}, ${p.updated_at})
    on conflict (player_id, game_id) do update set
      side = excluded.side, updated_at = excluded.updated_at
  `
}

for (const b of snapshot.weeklyBonuses ?? []) {
  await sql`
    insert into weekly_bonuses (player_id, season, week, kind, game_id, side, created_at, updated_at)
    values (${b.player_id}, ${b.season}, ${b.week}, ${b.kind}, ${b.game_id}, ${b.side},
            ${b.created_at}, ${b.updated_at})
    on conflict (player_id, season, week, kind) do update set
      game_id = excluded.game_id, side = excluded.side, updated_at = excluded.updated_at
  `
}

for (const m of snapshot.appMeta ?? []) {
  await sql`
    insert into app_meta (key, value) values (${m.key}, ${m.value})
    on conflict (key) do update set value = excluded.value
  `
}

const counts = snapshot.counts ?? {}
console.log(
  `Restored ${counts.games ?? 0} games, ${counts.picks ?? 0} picks, ` +
    `${counts.weeklyBonuses ?? 0} bonuses, ${counts.lineSnapshots ?? 0} line snapshots.`
)
process.exit(0)
