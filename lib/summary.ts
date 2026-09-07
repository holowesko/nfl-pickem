import { arePicksClosed } from './time'
import { kickoffLabel } from './slate'
import { spreadWinner, type Bonus, type Pick } from './scoring'
import type { GameRow } from './queries'

export type SummaryPick = {
  playerId: string
  /** Abbreviation of the team taken, or null if the game went unpicked. */
  team: string | null
  isLock: boolean
  isUpset: boolean
  /** True/false once the game is final, null before that or on a push. */
  correct: boolean | null
}

export type SummaryRow = {
  gameId: string
  away: string
  home: string
  kickoffLabel: string
  /** Picks are only revealed once a game has kicked off. */
  revealed: boolean
  score: string | null
  picks: SummaryPick[]
}

/**
 * One row per game, with what each player took.
 *
 * Shared by the Picks tab and the Leaderboard so the reveal rule is written
 * once. A game that has not kicked off gets an empty `picks` array rather than
 * a hidden one — the point is that nothing to hide ever reaches the client.
 */
export function buildSummaryRows(
  games: GameRow[],
  picks: Pick[],
  bonuses: Bonus[],
  players: { id: string }[],
  now: Date = new Date()
): SummaryRow[] {
  return games.map((game) => {
    const revealed = arePicksClosed(new Date(game.kickoff), now)
    const ats = spreadWinner(game)

    return {
      gameId: game.id,
      away: game.awayTeam,
      home: game.homeTeam,
      kickoffLabel: kickoffLabel(game.kickoff),
      revealed,
      score:
        game.final && game.homeScore !== null && game.awayScore !== null
          ? `${game.awayScore}–${game.homeScore} final`
          : null,
      picks: revealed
        ? players.map((p) => {
            const pick = picks.find((x) => x.playerId === p.id && x.gameId === game.id)
            const hasBonus = (kind: 'lock' | 'upset') =>
              bonuses.some(
                (b) =>
                  b.playerId === p.id &&
                  b.kind === kind &&
                  b.gameId === game.id &&
                  b.side === pick?.side
              )

            return {
              playerId: p.id,
              team: pick ? (pick.side === 'home' ? game.homeTeam : game.awayTeam) : null,
              isLock: hasBonus('lock'),
              isUpset: hasBonus('upset'),
              correct: pick && ats && ats !== 'push' ? ats === pick.side : null,
            }
          })
        : [],
    }
  })
}
