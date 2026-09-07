import { isDatabaseConfigured } from '@/lib/db'
import { PLAYERS } from '@/lib/players'
import {
  getCurrentWeek,
  getSeasonGames,
  getSeasonPicks,
  getSeasonBonuses,
  getWeekGames,
  getAvatarVersions,
} from '@/lib/queries'
import { scoreWeek } from '@/lib/scoring'
import { buildSummaryRows } from '@/lib/summary'
import { SetupChecklist } from '@/components/SetupChecklist'
import { WeekBreakdown, type WeekLine } from '@/components/WeekBreakdown'

export const metadata = { title: 'Leaderboard · HoloPicks NFL Duel' }

export default async function LeaderboardPage() {
  if (!isDatabaseConfigured) return <SetupChecklist />

  const current = await getCurrentWeek()
  if (!current) {
    return <Empty body="Nothing has been played yet." />
  }

  const [seasonGames, seasonPicks, seasonBonuses, avatars] = await Promise.all([
    getSeasonGames(current.season),
    getSeasonPicks(current.season),
    getSeasonBonuses(current.season),
    getAvatarVersions(),
  ])

  // Only weeks with a finished game have anything to say.
  const weeks = [...new Set(seasonGames.filter((g) => g.final).map((g) => g.week))].sort(
    (a, b) => a - b
  )

  if (weeks.length === 0) {
    return <Empty body="Standings appear once the first game has been played." />
  }

  const scoresByWeek = weeks.map((week) => {
    const games = seasonGames.filter((g) => g.week === week)
    return {
      week,
      perPlayer: PLAYERS.map((p) =>
        scoreWeek(
          p.id,
          week,
          games,
          seasonPicks.filter((pick) => pick.playerId === p.id),
          seasonBonuses.filter((b) => b.playerId === p.id && b.week === week)
        )
      ),
    }
  })

  const totals = PLAYERS.map((p, i) => {
    const weeksFor = scoresByWeek.map((w) => w.perPlayer[i])
    return {
      player: p,
      points: weeksFor.reduce((n, w) => n + w.points, 0),
      correct: weeksFor.reduce((n, w) => n + w.correct, 0),
      incorrect: weeksFor.reduce((n, w) => n + w.incorrect, 0),
      pushes: weeksFor.reduce((n, w) => n + w.pushes, 0),
      lockPoints: weeksFor.reduce((n, w) => n + w.lockPoints, 0),
      upsetPoints: weeksFor.reduce((n, w) => n + w.upsetPoints, 0),
      weeksWon: 0,
    }
  })

  // Week rows, plus who took each week.
  const weekLines: WeekLine[] = []

  for (const { week, perPlayer } of scoresByWeek) {
    const best = Math.max(...perPlayer.map((s) => s.points))
    const winners = best > 0 ? PLAYERS.filter((_, i) => perPlayer[i].points === best) : []
    for (const w of winners) {
      const total = totals.find((t) => t.player.id === w.id)
      if (total) total.weeksWon += 1
    }

    const games = await getWeekGames(current.season, week)
    weekLines.push({
      week,
      points: perPlayer.map((s) => s.points),
      winners: winners.map((w) => w.id),
      rows: buildSummaryRows(
        games,
        seasonPicks.filter((p) => games.some((g) => g.id === p.gameId)),
        seasonBonuses.filter((b) => b.week === week),
        PLAYERS
      ),
    })
  }

  weekLines.reverse() // most recent first

  // Ties share a place, so two players on the same points both read "1".
  const ranked = [...totals].sort((a, b) => b.points - a.points)
  const placeOf = (points: number) =>
    ranked.findIndex((r) => r.points === points) + 1

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>

      <div className="space-y-2">
        {ranked.map((row) => (
          <div
            key={row.player.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
          >
            <span className="w-5 shrink-0 text-center font-mono text-sm font-bold text-muted">
              {placeOf(row.points)}
            </span>

            {avatars.has(row.player.id) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/avatar/${row.player.id}?v=${avatars.get(row.player.id)}`}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : null}

            <div className="min-w-0 flex-1">
              <p className="font-semibold">{row.player.name}</p>
              <p className="text-[0.7rem] tabular-nums text-muted">
                {row.correct}&ndash;{row.incorrect}
                {row.pushes > 0 ? `–${row.pushes}` : ''} ATS
                {' · '}
                {row.lockPoints} lock · {row.upsetPoints} upset
                {row.weeksWon > 0
                  ? ` · ${row.weeksWon} week${row.weeksWon === 1 ? '' : 's'} won`
                  : ''}
              </p>
            </div>

            <span className="shrink-0 text-2xl font-bold tabular-nums">{row.points}</span>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          By week
        </h2>
        <WeekBreakdown players={PLAYERS} weeks={weekLines} />
        <p className="text-[0.7rem] text-muted">
          Tap a week to see everyone&rsquo;s picks. The week&rsquo;s best score is
          highlighted.
        </p>
      </section>
    </div>
  )
}

function Empty({ body }: { body: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
      <p className="text-muted">{body}</p>
    </div>
  )
}
