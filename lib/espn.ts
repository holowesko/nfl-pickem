/**
 * ESPN's public scoreboard endpoint is the single source of truth for the
 * schedule, the point spreads, and the final scores. It needs no API key.
 *
 * The response is large and only loosely documented, so everything here is
 * defensive: any field we cannot read becomes null rather than throwing, and a
 * game with no line yet is simply unpickable until one appears.
 */

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'

export type ImportedGame = {
  id: string
  season: number
  week: number
  kickoff: string
  homeTeam: string
  awayTeam: string
  homeName: string
  awayName: string
  /** Home-team perspective: -3.5 means the home team is favored by 3.5. */
  spreadHome: number | null
  homeScore: number | null
  awayScore: number | null
  final: boolean
}

export type Scoreboard = {
  season: number
  week: number
  games: ImportedGame[]
}

/**
 * The ESPN payload is large, loosely documented and not versioned, so it is an
 * untyped boundary by nature. Everything is narrowed by the readers below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

/**
 * ESPN reports the spread from the home team's perspective already, which
 * matches our own convention, so the number passes straight through. We prefer
 * the numeric `spread` and fall back to parsing the `details` string
 * ("SEA -3.5", or "EVEN" for a pick'em) when it is missing.
 */
function readSpread(competition: Json, homeAbbr: string): number | null {
  const books: Json[] = Array.isArray(competition.odds) ? competition.odds : []
  if (books.length === 0) return null

  const book =
    [...books].sort(
      (a, b) => (a.provider?.priority ?? 99) - (b.provider?.priority ?? 99)
    )[0] ?? books[0]

  if (typeof book.spread === 'number' && Number.isFinite(book.spread)) {
    return book.spread
  }

  const details: unknown = book.details
  if (typeof details !== 'string') return null
  if (details.trim().toUpperCase() === 'EVEN') return 0

  // e.g. "SEA -3.5" - the abbreviation names the favorite.
  const match = details.trim().match(/^([A-Z]{2,4})\s+([+-]?\d+(?:\.\d+)?)$/)
  if (!match) return null

  const [, abbr, rawLine] = match
  const line = Number(rawLine)
  if (!Number.isFinite(line)) return null

  // The line is quoted for `abbr`; flip it if that is the away team.
  return abbr === homeAbbr ? line : -line
}

function readScore(competitor: Json, started: boolean): number | null {
  if (!started) return null
  const value = Number(competitor?.score)
  return Number.isFinite(value) ? value : null
}

function parseEvent(event: Json, season: number, week: number): ImportedGame | null {
  const competition = event?.competitions?.[0]
  if (!competition) return null

  const competitors: Json[] = competition.competitors ?? []
  const home = competitors.find((c) => c.homeAway === 'home')
  const away = competitors.find((c) => c.homeAway === 'away')
  if (!home?.team?.abbreviation || !away?.team?.abbreviation) return null

  const state: string = competition.status?.type?.state ?? 'pre'
  const started = state !== 'pre'
  const final = competition.status?.type?.completed === true

  return {
    id: String(event.id),
    season,
    week,
    kickoff: new Date(event.date).toISOString(),
    homeTeam: home.team.abbreviation,
    awayTeam: away.team.abbreviation,
    homeName: home.team.name ?? home.team.displayName ?? home.team.abbreviation,
    awayName: away.team.name ?? away.team.displayName ?? away.team.abbreviation,
    spreadHome: readSpread(competition, home.team.abbreviation),
    homeScore: readScore(home, started),
    awayScore: readScore(away, started),
    final,
  }
}

export function parseScoreboard(payload: Json): Scoreboard {
  const season = Number(payload?.season?.year)
  const week = Number(payload?.week?.number)
  if (!Number.isFinite(season) || !Number.isFinite(week)) {
    throw new Error('ESPN response did not include a season and week')
  }

  const events: Json[] = Array.isArray(payload.events) ? payload.events : []
  const games = events
    .map((event) => parseEvent(event, season, week))
    .filter((g): g is ImportedGame => g !== null)

  return { season, week, games }
}

async function get(url: string): Promise<Json> {
  const response = await fetch(url, {
    // Always hit the network: this data changes throughout the day and the
    // caller is a scheduled job, not a page render.
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`ESPN request failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

/** The week ESPN currently considers live. */
export async function fetchCurrentScoreboard(): Promise<Scoreboard> {
  return parseScoreboard(await get(SCOREBOARD))
}

/** A specific regular-season week. */
export async function fetchWeek(season: number, week: number): Promise<Scoreboard> {
  const url = `${SCOREBOARD}?dates=${season}&seasontype=2&week=${week}`
  return parseScoreboard(await get(url))
}
