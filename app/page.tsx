import { isDatabaseConfigured } from '@/lib/db'
import { currentPlayer, PLAYERS } from '@/lib/players'
import {
  getCurrentWeek,
  getWeekGames,
  getWeekPicks,
  getWeekBonuses,
  type GameRow,
} from '@/lib/queries'
import { groupSlate, formatSpread } from '@/lib/slate'
import { etParts, arePicksClosed, isSpreadLocked } from '@/lib/time'
import { scoreWeek, underdogSide, POINTS_LOCK, POINTS_UPSET } from '@/lib/scoring'
import { SetupChecklist } from '@/components/SetupChecklist'
import { GameCard, type OtherPick } from '@/components/GameCard'
import { BonusPicker, type BonusOption } from '@/components/BonusPicker'

function kickoffLabel(iso: string): string {
  const p = etParts(new Date(iso))
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const meridiem = p.hour < 12 ? 'am' : 'pm'
  return `${p.weekday} ${p.month}/${p.day} · ${hour12}:${String(p.minute).padStart(2, '0')}${meridiem} ET`
}

function deadlineLabel(iso: string): string {
  const p = etParts(new Date(iso))
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const meridiem = p.hour < 12 ? 'am' : 'pm'
  return `${p.weekday} ${hour12}:${String(p.minute).padStart(2, '0')}${meridiem} ET`
}

/**
 * Every team still pickable this week, one entry per side.
 *
 * `onlyUnderdogs` is what makes the Upset list legal by construction rather
 * than by rejecting a choice after the fact.
 */
function bonusOptions(games: GameRow[], onlyUnderdogs: boolean): BonusOption[] {
  const options: BonusOption[] = []

  for (const game of games) {
    if (arePicksClosed(new Date(game.kickoff))) continue

    const dog = underdogSide(game.spreadHome)

    // The Upset needs a line to know who the underdog is. The Lock does not —
    // it is about winning outright — so a game without a posted line can still
    // be locked.
    if (onlyUnderdogs && dog === null) continue

    for (const side of ['away', 'home'] as const) {
      if (onlyUnderdogs && side !== dog) continue

      const isHome = side === 'home'
      const line = formatSpread(game.spreadHome, side)
      options.push({
        gameId: game.id,
        side,
        team: isHome ? game.homeTeam : game.awayTeam,
        name: isHome ? game.homeName : game.awayName,
        detail: `${isHome ? 'vs' : '@'} ${isHome ? game.awayTeam : game.homeTeam} · ${line}`,
      })
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name))
}

export default async function ThisWeekPage() {
  if (!isDatabaseConfigured) return <SetupChecklist />

  const player = await currentPlayer()
  const current = await getCurrentWeek()

  if (!current) {
    return (
      <Empty
        title="No week loaded yet"
        body="Nothing has pulled in the schedule yet."
        hint={
          process.env.NODE_ENV === 'production'
            ? 'Run the sync job once from the Actions tab.'
            : 'npm run seed'
        }
      />
    )
  }

  const [games, picks, bonuses] = await Promise.all([
    getWeekGames(current.season, current.week),
    getWeekPicks(current.season, current.week),
    getWeekBonuses(current.season, current.week),
  ])

  if (games.length === 0) {
    return <Empty title={`Week ${current.week}`} body="No games on the slate yet." />
  }

  const groups = groupSlate(games)
  const myPicks = new Map(
    picks.filter((p) => p.playerId === player?.id).map((p) => [p.gameId, p])
  )

  const scores = PLAYERS.map((p) => ({
    player: p,
    score: scoreWeek(
      p.id,
      current.week,
      games,
      picks.filter((pick) => pick.playerId === p.id),
      bonuses.filter((bonus) => bonus.playerId === p.id)
    ),
    made: picks.filter((pick) => pick.playerId === p.id).length,
  }))

  const lockOptions = bonusOptions(games, false)
  const upsetOptions = bonusOptions(games, true)

  const mine = (kind: 'lock' | 'upset') =>
    bonuses.find((b) => b.playerId === player?.id && b.kind === kind) ?? null

  const asOption = (kind: 'lock' | 'upset'): BonusOption | null => {
    const bonus = mine(kind)
    if (!bonus) return null
    const list = kind === 'lock' ? lockOptions : upsetOptions
    const match = list.find((o) => o.gameId === bonus.gameId && o.side === bonus.side)
    if (match) return match

    // The chosen game has kicked off, so it is no longer in the option list.
    // Still show what was picked.
    const game = games.find((g) => g.id === bonus.gameId)
    if (!game) return null
    const isHome = bonus.side === 'home'
    return {
      gameId: bonus.gameId,
      side: bonus.side,
      team: isHome ? game.homeTeam : game.awayTeam,
      name: isHome ? game.homeName : game.awayName,
      detail: 'Locked in',
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Week {current.week}</h1>
        <p className="text-sm text-muted">{games.length} games</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {scores.map(({ player: p, score, made }) => (
          <div key={p.id} className="rounded-xl border border-border bg-surface p-3 text-center">
            <p className="text-xs text-muted">{p.name}</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{score.points}</p>
            <p className="text-xs text-muted">
              {made}/{games.length} in
            </p>
          </div>
        ))}
      </div>

      {!player ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm">
          Tap your name above to start picking.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <BonusPicker
          kind="lock"
          label="Lock"
          points={`+${POINTS_LOCK}`}
          hint="One a week. Wins outright, spread be damned."
          options={lockOptions}
          selected={asOption('lock')}
          season={current.season}
          week={current.week}
          canPick={Boolean(player)}
        />
        <BonusPicker
          kind="upset"
          label="Upset"
          points={`+${POINTS_UPSET}`}
          hint="One a week. Underdogs only, must win outright."
          options={upsetOptions}
          selected={asOption('upset')}
          season={current.season}
          week={current.week}
          canPick={Boolean(player)}
        />
      </div>

      {groups.map((group) => {
        const spreadLocked = isSpreadLocked(new Date(group.games[0].kickoff))

        return (
          <section key={group.key} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {group.label}
              </h2>
              <p className="text-xs text-muted">
                {spreadLocked
                  ? 'Lines final'
                  : `Lines freeze ${deadlineLabel(group.lockAt)}`}
              </p>
            </div>

            <div className="grid gap-2">
              {group.games.map((game) => {
                const mySide = myPicks.get(game.id)?.side ?? null

                // Other players' picks stay hidden until this game kicks off.
                // The filtering happens here, on the server, so the hidden
                // picks are never serialised into the page at all — hiding
                // them in the component would still ship them to the browser
                // for anyone curious enough to read the source.
                const revealed = arePicksClosed(new Date(game.kickoff))
                const theirs = picks.filter(
                  (p) => p.gameId === game.id && p.playerId !== player?.id
                )
                const others: OtherPick[] = revealed
                  ? theirs.map((p) => ({
                      playerId: p.playerId,
                      playerName:
                        PLAYERS.find((x) => x.id === p.playerId)?.name ?? p.playerId,
                      side: p.side,
                      isLock: bonuses.some(
                        (b) =>
                          b.playerId === p.playerId &&
                          b.kind === 'lock' &&
                          b.gameId === game.id &&
                          b.side === p.side
                      ),
                      isUpset: bonuses.some(
                        (b) =>
                          b.playerId === p.playerId &&
                          b.kind === 'upset' &&
                          b.gameId === game.id &&
                          b.side === p.side
                      ),
                    }))
                  : []

                return (
                  <GameCard
                    key={game.id}
                    game={{
                      id: game.id,
                      homeTeam: game.homeTeam,
                      awayTeam: game.awayTeam,
                      homeName: game.homeName,
                      awayName: game.awayName,
                      kickoff: game.kickoff,
                      kickoffLabel: kickoffLabel(game.kickoff),
                      spreadHome: game.spreadHome,
                      lockedSpreadHome: game.lockedSpreadHome,
                      homeScore: game.homeScore,
                      awayScore: game.awayScore,
                      final: game.final,
                      locked: revealed,
                      spreadLocked: isSpreadLocked(new Date(game.kickoff)),
                    }}
                    mySide={mySide}
                    others={others}
                    othersIn={revealed ? 0 : theirs.length}
                    canPick={Boolean(player)}
                  />
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Empty({ title, body, hint }: { title: string; body: string; hint?: string }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted">{body}</p>
      {hint ? (
        <p className="rounded-lg border border-border bg-surface-2 p-3 font-mono text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
