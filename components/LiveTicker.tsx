import type { LiveEntry } from '@/lib/live'
import { PLAYERS } from '@/lib/players'

/**
 * A chyron of what is happening right now, across the top of the Picks tab.
 *
 * The Feed is where these live, but nobody is on the Feed while they are making
 * picks — so the good ones come to them instead. Same entries, same ranking,
 * just the top few.
 *
 * The track holds two copies of the list and slides exactly half its width, so
 * the second copy is in the first one's place when the animation restarts and
 * the loop has no seam. Duration scales with the text so a long list does not
 * race past.
 */
export function LiveTicker({
  entries,
  avatars,
}: {
  entries: LiveEntry[]
  avatars: Map<string, string>
}) {
  if (entries.length === 0) return null

  // Roughly nine characters a second reads comfortably without hurrying.
  const characters = entries.reduce((n, e) => n + e.headline.length + 12, 0)
  const seconds = Math.max(18, Math.round(characters / 9))

  const items = entries.map((entry) => {
    const player = PLAYERS.find((p) => p.id === entry.playerId)
    const version = avatars.get(entry.playerId)
    const tone =
      entry.tone === 'good'
        ? 'text-accent'
        : entry.tone === 'bad'
          ? 'text-lock'
          : 'text-foreground'

    return (
      <span key={entry.id} className="flex shrink-0 items-center gap-2 pr-8">
        {version ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/avatar/${entry.playerId}?v=${version}`}
            alt=""
            width={18}
            height={18}
            className="h-[18px] w-[18px] shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-[0.55rem] font-bold text-muted"
          >
            {(player?.name ?? entry.playerId).slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className={`text-xs font-semibold ${tone}`}>{entry.headline}</span>
        <span aria-hidden="true" className="text-muted">
          &middot;
        </span>
      </span>
    )
  })

  return (
    <div className="ticker overflow-hidden rounded-xl border border-accent/30 bg-surface py-2">
      <div className="ticker-track" style={{ animationDuration: `${seconds}s` }}>
        {/* The first copy is what is read; the second only exists to make the
            wrap seamless, so it is hidden from assistive tech. */}
        <div className="flex shrink-0 items-center pl-3">{items}</div>
        <div aria-hidden="true" className="flex shrink-0 items-center pl-3">
          {items}
        </div>
      </div>
    </div>
  )
}
