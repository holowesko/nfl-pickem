import { isDatabaseConfigured } from '@/lib/db'
import { PLAYERS } from '@/lib/players'
import {
  getCurrentWeek,
  getSeasonGames,
  getSeasonPicks,
  getSeasonBonuses,
  getSeasonPickTimings,
  getSeasonSnapshots,
  getAvatarVersions,
} from '@/lib/queries'
import { insightsFor, type Insight } from '@/lib/insights'
import { SetupChecklist } from '@/components/SetupChecklist'

export const metadata = { title: 'Analysis · HoloPicks NFL Duel' }

export default async function AnalysisPage() {
  if (!isDatabaseConfigured) return <SetupChecklist />

  const current = await getCurrentWeek()
  if (!current) return <Empty body="Nothing has been played yet." />

  const [games, picks, bonuses, timings, snapshots, avatars] = await Promise.all([
    getSeasonGames(current.season),
    getSeasonPicks(current.season),
    getSeasonBonuses(current.season),
    getSeasonPickTimings(current.season),
    getSeasonSnapshots(current.season),
    getAvatarVersions(),
  ])

  const played = games.filter((g) => g.final)
  if (played.length === 0) {
    return <Empty body="Come back once a week has been played." />
  }

  const cards = PLAYERS.map((player) => ({
    player,
    insights: insightsFor({
      player,
      others: PLAYERS.filter((p) => p.id !== player.id),
      games,
      picks,
      bonuses,
      timings,
      snapshots,
    }),
  }))

  const weeksPlayed = new Set(played.map((g) => g.week)).size

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analysis</h1>
        <p className="mt-1 text-sm text-muted">
          What the season says about each of you, strongest first. Nothing is shown
          until the evidence is there, so early cards are short on purpose.
        </p>
      </div>

      {weeksPlayed < 4 ? (
        <p className="rounded-xl border border-border bg-surface p-3 text-xs text-muted">
          {weeksPlayed} {weeksPlayed === 1 ? 'week' : 'weeks'} played. Treat anything
          marked <em>thin</em> as a rumour rather than a fact.
        </p>
      ) : null}

      {cards.map(({ player, insights }) => (
        <section
          key={player.id}
          className="overflow-hidden rounded-xl border border-border bg-surface"
        >
          <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-3">
            {avatars.has(player.id) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/avatar/${player.id}?v=${avatars.get(player.id)}`}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : null}
            <h2 className="flex-1 font-bold tracking-tight">{player.name}</h2>
            <span className="text-[0.7rem] tabular-nums text-muted">
              {insights.length} of 5
            </span>
          </div>

          {insights.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              Nothing worth saying yet. Keep playing.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {insights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  const tone =
    insight.tone === 'good'
      ? 'text-accent'
      : insight.tone === 'bad'
        ? 'text-lock'
        : 'text-foreground'

  return (
    <li className="px-4 py-3">
      <p className={`text-sm font-semibold ${tone}`}>{insight.headline}</p>
      <p className="mt-0.5 text-sm text-muted">{insight.detail}</p>
      <p className="mt-1 text-[0.65rem] uppercase tracking-wide text-muted">
        {insight.confidence} &middot; n={insight.sample}
      </p>
    </li>
  )
}

function Empty({ body }: { body: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Analysis</h1>
      <p className="text-muted">{body}</p>
    </div>
  )
}
