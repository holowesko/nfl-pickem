import { db, toNumber, type Row } from './db'
import { spreadLockTimeFor } from './time'
import type { Bonus, BonusKind, Game, Pick, Side } from './scoring'
import type { ImportedGame, Scoreboard } from './espn'

function toGame(row: Row): Game {
  return {
    id: row.id,
    week: Number(row.week),
    kickoff: new Date(row.kickoff).toISOString(),
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    spreadHome: toNumber(row.spread_home),
    lockedSpreadHome: toNumber(row.locked_spread_home),
    homeScore: row.home_score === null ? null : Number(row.home_score),
    awayScore: row.away_score === null ? null : Number(row.away_score),
    final: row.final === true,
  }
}

export type GameRow = Game & { homeName: string; awayName: string; season: number }

function toGameRow(row: Row): GameRow {
  return {
    ...toGame(row),
    season: Number(row.season),
    homeName: row.home_name,
    awayName: row.away_name,
  }
}

function toPick(row: Row): Pick {
  return {
    playerId: row.player_id,
    gameId: row.game_id,
    side: row.side as Side,
  }
}

function toBonus(row: Row): Bonus {
  return {
    playerId: row.player_id,
    week: Number(row.week),
    kind: row.kind as BonusKind,
    gameId: row.game_id,
    side: row.side as Side,
  }
}

/**
 * Upsert the week's games and record a line snapshot whenever the spread has
 * actually moved. Snapshots are what make the graded line independent of when
 * the scheduled job happens to run.
 */
export async function syncScoreboard(
  board: Scoreboard
): Promise<{ games: number; snapshots: number }> {
  const sql = await db()
  if (board.games.length === 0) return { games: 0, snapshots: 0 }

  const ids = board.games.map((g) => g.id)
  const existing = (await sql`
    select id, spread_home from games where id = any(${ids})
  `) as Row[]
  const previousSpread = new Map(existing.map((r) => [r.id, toNumber(r.spread_home)]))

  let snapshots = 0

  for (const game of board.games) {
    await upsertGame(game)

    // Only snapshot when the number changed (or is new), so the table stays a
    // record of line movement rather than one row every thirty minutes.
    const changed =
      !previousSpread.has(game.id) || previousSpread.get(game.id) !== game.spreadHome

    if (game.spreadHome !== null && changed) {
      await sql`
        insert into line_snapshots (game_id, spread_home)
        values (${game.id}, ${game.spreadHome})
      `
      snapshots += 1
    }
  }

  return { games: board.games.length, snapshots }
}

async function upsertGame(game: ImportedGame): Promise<void> {
  const sql = await db()
  const spreadSeenAt = game.spreadHome === null ? null : new Date().toISOString()

  await sql`
    insert into games (
      id, season, week, kickoff, home_team, away_team, home_name, away_name,
      spread_home, spread_updated_at, home_score, away_score, final, updated_at
    ) values (
      ${game.id}, ${game.season}, ${game.week}, ${game.kickoff},
      ${game.homeTeam}, ${game.awayTeam}, ${game.homeName}, ${game.awayName},
      ${game.spreadHome}, ${spreadSeenAt},
      ${game.homeScore}, ${game.awayScore}, ${game.final}, now()
    )
    on conflict (id) do update set
      kickoff    = excluded.kickoff,
      home_team  = excluded.home_team,
      away_team  = excluded.away_team,
      home_name  = excluded.home_name,
      away_name  = excluded.away_name,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      final      = excluded.final,
      spread_home = coalesce(excluded.spread_home, games.spread_home),
      spread_updated_at = case
        when excluded.spread_home is not null
         and excluded.spread_home is distinct from games.spread_home
        then now()
        else games.spread_updated_at
      end,
      updated_at = now()
  `
}

/**
 * Freeze the graded line for every game whose lock window has closed.
 *
 * The frozen number is the most recent snapshot taken at or before the lock
 * instant — not whatever the line happens to be right now — so a job that runs
 * late (or not at all until hours afterwards) still grades the week correctly.
 */
export async function freezeLockedSpreads(now: Date = new Date()): Promise<number> {
  const sql = await db()
  const horizon = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString()

  const pending = (await sql`
    select id, kickoff from games
    where locked_spread_home is null and kickoff < ${horizon}
  `) as Row[]

  let frozen = 0

  for (const row of pending) {
    const lockAt = spreadLockTimeFor(new Date(row.kickoff))
    if (now.getTime() < lockAt.getTime()) continue

    const [snapshot] = (await sql`
      select spread_home from line_snapshots
      where game_id = ${row.id} and captured_at <= ${lockAt.toISOString()}
      order by captured_at desc
      limit 1
    `) as Row[]

    // No snapshot before the deadline means we never saw a line for this game
    // in time. Fall back to the current line rather than leaving the game
    // permanently ungradeable.
    const spread = snapshot ? toNumber(snapshot.spread_home) : await currentSpread(row.id)
    if (spread === null) continue

    await sql`
      update games
      set locked_spread_home = ${spread}, spread_locked_at = ${lockAt.toISOString()}
      where id = ${row.id} and locked_spread_home is null
    `
    frozen += 1
  }

  return frozen
}

async function currentSpread(gameId: string): Promise<number | null> {
  const sql = await db()
  const [row] = (await sql`select spread_home from games where id = ${gameId}`) as Row[]
  return row ? toNumber(row.spread_home) : null
}

export async function getWeekGames(season: number, week: number): Promise<GameRow[]> {
  const sql = await db()
  const rows = (await sql`
    select * from games
    where season = ${season} and week = ${week}
    order by kickoff asc, id asc
  `) as Row[]
  return rows.map(toGameRow)
}

export async function getWeekPicks(season: number, week: number): Promise<Pick[]> {
  const sql = await db()
  const rows = (await sql`
    select p.* from picks p
    join games g on g.id = p.game_id
    where g.season = ${season} and g.week = ${week}
  `) as Row[]
  return rows.map(toPick)
}

export async function getSeasonGames(season: number): Promise<Game[]> {
  const sql = await db()
  const rows = (await sql`
    select * from games where season = ${season} order by week asc, kickoff asc
  `) as Row[]
  return rows.map(toGame)
}

export async function getSeasonPicks(season: number): Promise<Pick[]> {
  const sql = await db()
  const rows = (await sql`
    select p.* from picks p
    join games g on g.id = p.game_id
    where g.season = ${season}
  `) as Row[]
  return rows.map(toPick)
}

export async function getPlayers(): Promise<{ id: string; name: string }[]> {
  const sql = await db()
  const rows = (await sql`select id, name from players order by sort_order asc`) as Row[]
  return rows.map((r) => ({ id: r.id, name: r.name }))
}

/** Insert or replace a player's pick on one game, preserving its bonus flags. */
export async function upsertPick(playerId: string, gameId: string, side: Side) {
  const sql = await db()
  await sql`
    insert into picks (player_id, game_id, side)
    values (${playerId}, ${gameId}, ${side})
    on conflict (player_id, game_id) do update set
      side = excluded.side,
      updated_at = now()
  `
}

export async function removePick(playerId: string, gameId: string) {
  const sql = await db()
  await sql`delete from picks where player_id = ${playerId} and game_id = ${gameId}`
}

/** Every Lock and Upset set for a week, across all players. */
export async function getWeekBonuses(season: number, week: number): Promise<Bonus[]> {
  const sql = await db()
  const rows = (await sql`
    select * from weekly_bonuses where season = ${season} and week = ${week}
  `) as Row[]
  return rows.map(toBonus)
}

export async function getSeasonBonuses(season: number): Promise<Bonus[]> {
  const sql = await db()
  const rows = (await sql`
    select * from weekly_bonuses where season = ${season}
  `) as Row[]
  return rows.map(toBonus)
}

/**
 * Set (or move) a player's Lock or Upset for a week.
 *
 * The primary key covers player, season, week and kind, so an upsert is all
 * that "only one per week" requires — no clearing of a previous choice, and no
 * window where two could exist.
 */
export async function setBonus(
  playerId: string,
  season: number,
  week: number,
  kind: BonusKind,
  gameId: string,
  side: Side
): Promise<void> {
  const sql = await db()
  await sql`
    insert into weekly_bonuses (player_id, season, week, kind, game_id, side)
    values (${playerId}, ${season}, ${week}, ${kind}, ${gameId}, ${side})
    on conflict (player_id, season, week, kind) do update set
      game_id = excluded.game_id,
      side = excluded.side,
      updated_at = now()
  `
}

export async function clearBonus(
  playerId: string,
  season: number,
  week: number,
  kind: BonusKind
): Promise<void> {
  const sql = await db()
  await sql`
    delete from weekly_bonuses
    where player_id = ${playerId} and season = ${season}
      and week = ${week} and kind = ${kind}
  `
}

export async function getGame(gameId: string): Promise<GameRow | null> {
  const sql = await db()
  const [row] = (await sql`select * from games where id = ${gameId}`) as Row[]
  return row ? toGameRow(row) : null
}

export async function getPick(playerId: string, gameId: string): Promise<Pick | null> {
  const sql = await db()
  const [row] = (await sql`
    select * from picks where player_id = ${playerId} and game_id = ${gameId}
  `) as Row[]
  return row ? toPick(row) : null
}

/** The week the app should show: whatever ESPN last told us is current. */
export async function getCurrentWeek(): Promise<{ season: number; week: number } | null> {
  const sql = await db()
  const [row] = (await sql`
    select value from app_meta where key = 'current_week'
  `) as Row[]
  if (!row) return null
  const [season, week] = String(row.value).split(':').map(Number)
  if (!Number.isFinite(season) || !Number.isFinite(week)) return null
  return { season, week }
}

export async function setCurrentWeek(season: number, week: number): Promise<void> {
  const sql = await db()
  await sql`
    insert into app_meta (key, value) values ('current_week', ${`${season}:${week}`})
    on conflict (key) do update set value = excluded.value
  `
}

export type Avatar = { dataBase64: string; mime: string; updatedAt: string }

/** Which players have a photo, and when it last changed (for cache busting). */
export async function getAvatarVersions(): Promise<Map<string, string>> {
  const sql = await db()
  const rows = (await sql`
    select player_id, updated_at from player_avatars
  `) as Row[]
  return new Map(
    rows.map((r) => [r.player_id, new Date(r.updated_at).getTime().toString(36)])
  )
}

export async function getAvatar(playerId: string): Promise<Avatar | null> {
  const sql = await db()
  const [row] = (await sql`
    select data_base64, mime, updated_at from player_avatars
    where player_id = ${playerId}
  `) as Row[]
  if (!row) return null
  return {
    dataBase64: row.data_base64,
    mime: row.mime,
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export async function setAvatar(
  playerId: string,
  dataBase64: string,
  mime: string
): Promise<void> {
  const sql = await db()
  await sql`
    insert into player_avatars (player_id, data_base64, mime)
    values (${playerId}, ${dataBase64}, ${mime})
    on conflict (player_id) do update set
      data_base64 = excluded.data_base64,
      mime = excluded.mime,
      updated_at = now()
  `
}

export async function clearAvatar(playerId: string): Promise<void> {
  const sql = await db()
  await sql`delete from player_avatars where player_id = ${playerId}`
}

export async function getBonus(
  playerId: string,
  season: number,
  week: number,
  kind: BonusKind
): Promise<Bonus | null> {
  const sql = await db()
  const [row] = (await sql`
    select * from weekly_bonuses
    where player_id = ${playerId} and season = ${season}
      and week = ${week} and kind = ${kind}
  `) as Row[]
  return row ? toBonus(row) : null
}
