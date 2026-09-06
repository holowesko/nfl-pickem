import { isDatabaseConfigured } from '@/lib/db'
import { currentPlayer, PLAYERS } from '@/lib/players'
import { getCurrentWeek, getWeekGames, getWeekPicks } from '@/lib/queries'
import { groupSlate } from '@/lib/slate'
import { etParts, arePicksClosed, isSpreadLocked } from '@/lib/time'
import { scoreWeek } from '@/lib/scoring'
import { SetupChecklist } from '@/components/SetupChecklist'
import { GameCard, type OtherPick } from '@/components/GameCard'

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

export default async function ThisWeekPage() {
  if (!isDatabaseConfigured) return <SetupChecklist />

  const player = await currentPlayer()
  const current = await getCurrentWeek()

  if (!current) {
    return (
      <Empty
        title="No week loaded yet"
        body="Run the sync job once to pull in the schedule and the opening lines."
      />
    )
  }

  const [games, picks] = await Promise.all([
    getWeekGames(current.season, current.week),
    getWeekPicks(current.season, current.week),
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
      picks.filter((pick) => pick.playerId === p.id)
    ),
    made: picks.filter((pick) => pick.playerId === p.id).length,
  }))

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
                const mine = myPicks.get(game.id)
                const others: OtherPick[] = picks
                  .filter((p) => p.gameId === game.id && p.playerId !== player?.id)
                  .map((p) => ({
                    playerId: p.playerId,
                    playerName: PLAYERS.find((x) => x.id === p.playerId)?.name ?? p.playerId,
                    side: p.side,
                    isLock: p.isLock,
                    isUpset: p.isUpset,
                  }))

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
                      locked: arePicksClosed(new Date(game.kickoff)),
                      spreadLocked: isSpreadLocked(new Date(game.kickoff)),
                    }}
                    mySide={mine?.side ?? null}
                    isLock={mine?.isLock ?? false}
                    isUpset={mine?.isUpset ?? false}
                    others={others}
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

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted">{body}</p>
    </div>
  )
}
