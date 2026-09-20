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
import { buildFeed, type FeedEntry } from '@/lib/insights'
import { liveEntries, type LiveEntry } from '@/lib/live'
import { LiveRefresh } from '@/components/LiveRefresh'
import { InsightChartView } from '@/components/InsightChart'
import { SetupChecklist } from '@/components/SetupChecklist'

export const metadata = { title: 'The Feed · HoloPicks NFL Duel' }

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

  // What is happening right now, which outranks anything the season has to say.
  const live = liveEntries({ players: PLAYERS, games, picks, bonuses })
  const anyLive = games.some(
    (g) => !g.final && g.homeScore !== null && new Date(g.kickoff) <= new Date()
  )

  const played = games.filter((g) => g.final)
  if (played.length === 0 && live.length === 0) {
    return <Empty body="Come back once a week has been played." />
  }

  const feed = buildFeed(
    PLAYERS.map((player) => ({
      player,
      others: PLAYERS.filter((p) => p.id !== player.id),
      games,
      picks,
      bonuses,
      timings,
      snapshots,
    }))
  )

  const weeksPlayed = new Set(played.map((g) => g.week)).size

  return (
    <div className="space-y-4">
      {/* Live entries are only true for as long as the moment lasts, so the
          page has to keep pulling. Below the fold of a game day this does
          nothing, because nothing is in progress. */}
      <LiveRefresh live={anyLive} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">The Feed</h1>
        <p className="mt-1 text-sm text-muted">
          Everything the season has on the three of you, worst first.
        </p>
      </div>

      {live.length > 0 ? (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-accent">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse"
            />
            Right now
          </h2>

          <ol className="space-y-2">
            {live.map((entry) => (
              <LiveCard
                key={entry.id}
                entry={entry}
                avatarVersion={avatars.get(entry.playerId)}
              />
            ))}
          </ol>
        </section>
      ) : null}

      {weeksPlayed < 4 ? (
        <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
          {weeksPlayed} {weeksPlayed === 1 ? 'week' : 'weeks'} in. Anything marked{' '}
          <em>thin</em> is a rumour, and the good stuff needs a few more Sundays.
        </p>
      ) : null}

      {feed.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          Nobody has done anything stupid enough to mention yet. Give it time.
        </p>
      ) : (
        <ol className="space-y-3">
          {feed.map((entry) => (
            <FeedCard
              key={`${entry.player.id}-${entry.id}`}
              entry={entry}
              avatarVersion={avatars.get(entry.player.id)}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * A live entry. Deliberately leaner than a season card: no sample size, no
 * confidence and no chart, because none of those mean anything about a game
 * that is still being played.
 */
function LiveCard({
  entry,
  avatarVersion,
}: {
  entry: LiveEntry
  avatarVersion?: string
}) {
  const tone =
    entry.tone === 'good'
      ? 'text-accent'
      : entry.tone === 'bad'
        ? 'text-lock'
        : 'text-foreground'

  const player = PLAYERS.find((p) => p.id === entry.playerId)

  return (
    <li className="rounded-xl border border-accent/30 bg-surface p-3">
      <div className="flex items-center gap-2">
        {avatarVersion ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/avatar/${entry.playerId}?v=${avatarVersion}`}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[0.65rem] font-bold text-muted"
          >
            {(player?.name ?? entry.playerId).slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="text-xs font-semibold text-muted">{player?.name}</span>
      </div>

      <p className={`mt-1.5 text-[0.95rem] font-semibold leading-snug ${tone}`}>
        {entry.headline}
      </p>
      <p className="mt-1 text-sm text-muted">{entry.detail}</p>
    </li>
  )
}

function FeedCard({
  entry,
  avatarVersion,
}: {
  entry: FeedEntry
  avatarVersion?: string
}) {
  const tone =
    entry.tone === 'good'
      ? 'text-accent'
      : entry.tone === 'bad'
        ? 'text-lock'
        : 'text-foreground'

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        {avatarVersion ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/avatar/${entry.player.id}?v=${avatarVersion}`}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[0.7rem] font-bold text-muted"
          >
            {entry.player.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="text-sm font-semibold">{entry.player.name}</span>
        <span className="ml-auto text-[0.65rem] uppercase tracking-wide text-muted">
          {entry.confidence} &middot; n={entry.sample}
        </span>
      </div>

      <p className={`mt-2 text-[0.95rem] font-semibold leading-snug ${tone}`}>
        {entry.headline}
      </p>
      <p className="mt-1 text-sm text-muted">{entry.detail}</p>

      {entry.chart ? <InsightChartView chart={entry.chart} /> : null}
    </li>
  )
}

function Empty({ body }: { body: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">The Feed</h1>
      <p className="text-muted">{body}</p>
    </div>
  )
}
