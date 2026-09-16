import type { InsightChart } from '@/lib/insights'

/**
 * The small pictures that sit under a feed headline.
 *
 * Three shapes, deliberately plain. Every one is direct-labelled with the same
 * numbers the sentence above it states, so nothing is carried by colour alone
 * and a reader who cannot separate the two hues loses nothing.
 *
 * The series colours are their own tokens rather than the UI accent: as a
 * categorical pair they are checked for lightness, chroma, contrast and
 * colour-vision separation against the card, which the interface tokens fail.
 */
export function InsightChartView({ chart }: { chart: InsightChart }) {
  if (chart.kind === 'split') return <SplitBar parts={chart.parts} />
  if (chart.kind === 'bars') return <RecordBars bars={chart.bars} />
  return <ResultStrip results={chart.results} caption={chart.caption} />
}

/** Two proportions of one whole, with both shares spelled out beneath. */
function SplitBar({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0)
  if (total === 0) return null

  const colors = ['bg-chart-1', 'bg-chart-2']

  return (
    <div className="mt-2.5">
      <div className="flex h-2.5 gap-0.5 overflow-hidden">
        {parts.map((part, i) => (
          <div
            key={part.label}
            className={`${colors[i % colors.length]} first:rounded-l-[3px] last:rounded-r-[3px]`}
            style={{ flexGrow: part.value, flexBasis: 0 }}
          />
        ))}
      </div>

      {/* A swatch for a segment with no width is noise, not a key. */}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {parts.map((part, i) => part.value === 0 ? null : (
          <span key={part.label} className="flex items-center gap-1.5 text-[0.7rem] text-muted">
            <span
              aria-hidden="true"
              className={`${colors[i % colors.length]} h-2 w-2 rounded-[2px]`}
            />
            {Math.round((part.value / total) * 100)}% {part.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** One row per record, each labelled with the figures it draws. */
function RecordBars({ bars }: { bars: { label: string; won: number; lost: number }[] }) {
  const widest = Math.max(...bars.map((b) => b.won + b.lost), 1)

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {bars.map((bar) => {
        const played = bar.won + bar.lost
        return (
          <div key={bar.label}>
            <div className="flex items-baseline justify-between gap-3 text-[0.7rem]">
              <span className="truncate text-muted">{bar.label}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted">
                {bar.won}&ndash;{bar.lost}
              </span>
            </div>

            <div
              className="mt-1 flex h-2 gap-0.5"
              style={{ width: `${(played / widest) * 100}%` }}
            >
              {bar.won > 0 ? (
                <div
                  className="rounded-l-[3px] bg-chart-1 last:rounded-r-[3px]"
                  style={{ flexGrow: bar.won, flexBasis: 0 }}
                />
              ) : null}
              {bar.lost > 0 ? (
                <div
                  className="rounded-r-[3px] bg-chart-miss first:rounded-l-[3px]"
                  style={{ flexGrow: bar.lost, flexBasis: 0 }}
                />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Results in the order they happened.
 *
 * Covered is a filled square and missed is an outlined one, so the two differ
 * in shape as well as colour.
 */
function ResultStrip({
  results,
  caption,
}: {
  results: (boolean | null)[]
  caption?: string
}) {
  if (results.length === 0) return null

  const won = results.filter((r) => r === true).length
  const lost = results.filter((r) => r === false).length

  return (
    <div className="mt-2.5">
      <div
        className="flex flex-wrap gap-1"
        role="img"
        aria-label={`${won} covered, ${lost} missed, oldest first`}
      >
        {results.map((result, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={
              result === true
                ? 'h-2.5 w-2.5 rounded-[2px] bg-chart-1'
                : result === false
                  ? 'h-2.5 w-2.5 rounded-[2px] border border-chart-miss'
                  : 'h-2.5 w-2.5 rounded-[2px] bg-chart-miss'
            }
          />
        ))}
      </div>

      <p className="mt-1.5 text-[0.7rem] text-muted">
        {won}&ndash;{lost}
        {caption ? ` · ${caption}` : ''} · oldest first
      </p>
    </div>
  )
}
