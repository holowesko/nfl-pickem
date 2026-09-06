/**
 * Team logos, served by ESPN's CDN.
 *
 * The URL is derived from the team abbreviation rather than stored alongside
 * the game. ESPN does hand us a logo URL in the scoreboard payload, but using
 * it would mean two new columns, a migration to run by hand against the live
 * database, and a re-sync — a lot of ceremony for a picture. All 32 current
 * abbreviations resolve under this pattern, and `TeamLogo` falls back to the
 * abbreviation if a request ever 404s, so a change at ESPN's end degrades to
 * what we displayed before rather than to a broken image.
 */
const ESPN = 'https://a.espncdn.com/i/teamlogos/nfl'

/**
 * The full-colour mark, used in both themes.
 *
 * ESPN also publishes a `500-dark` variant, but it is not a usable counterpart:
 * for most teams it is dark ink that disappears on our dark card, while for
 * others — the Rams among them — it is white, which disappears on the light
 * one. Both were checked against all 32 teams; only `500` reads on both grounds.
 */
export function teamLogo(abbreviation: string): string {
  return `${ESPN}/500/scoreboard/${abbreviation.toLowerCase()}.png`
}
