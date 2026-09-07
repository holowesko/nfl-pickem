import { db, type Row } from './db'

/**
 * A complete dump of the pool's history, for the weekly backup.
 *
 * Profile photos are deliberately left out. The backup is committed to a public
 * repository, and family photographs do not belong there — everything else here
 * is game data that the Rules page already explains in public.
 *
 * Rows come back in a stable order so that a week-to-week diff shows what
 * actually changed rather than a reshuffle.
 */
export type Snapshot = {
  exportedAt: string
  counts: Record<string, number>
  players: Row[]
  games: Row[]
  picks: Row[]
  weeklyBonuses: Row[]
  lineSnapshots: Row[]
  appMeta: Row[]
}

export async function buildSnapshot(): Promise<Snapshot> {
  const sql = await db()

  const [players, games, picks, weeklyBonuses, lineSnapshots, appMeta] = [
    (await sql`select * from players order by sort_order, id`) as Row[],
    (await sql`select * from games order by season, week, kickoff, id`) as Row[],
    (await sql`select * from picks order by player_id, game_id`) as Row[],
    (await sql`
      select * from weekly_bonuses order by season, week, player_id, kind
    `) as Row[],
    (await sql`
      select * from line_snapshots order by game_id, captured_at, id
    `) as Row[],
    (await sql`select * from app_meta order by key`) as Row[],
  ]

  return {
    exportedAt: new Date().toISOString(),
    counts: {
      players: players.length,
      games: games.length,
      picks: picks.length,
      weeklyBonuses: weeklyBonuses.length,
      lineSnapshots: lineSnapshots.length,
    },
    players,
    games,
    picks,
    weeklyBonuses,
    lineSnapshots,
    appMeta,
  }
}
