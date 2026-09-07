'use client'

import { useState } from 'react'
import { PickSummaryDialog } from './PickSummary'
import type { SummaryRow } from '@/lib/summary'

export type WeekLine = {
  week: number
  /** Points per player, in the same order as `players`. */
  points: number[]
  /** Player ids with the week's high score — empty if the week is scoreless. */
  winners: string[]
  rows: SummaryRow[]
}

/**
 * Week-by-week scores, with each row opening that week's picks.
 *
 * The rows are already built on the server, so opening a week costs nothing and
 * works offline once the page has loaded.
 */
export function WeekBreakdown({
  players,
  weeks,
}: {
  players: { id: string; name: string }[]
  weeks: WeekLine[]
}) {
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const active = weeks.find((w) => w.week === openWeek) ?? null

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
          <span className="w-14 shrink-0 text-[0.7rem] uppercase tracking-wide text-muted">
            Week
          </span>
          {players.map((p) => (
            <span
              key={p.id}
              className="flex-1 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-muted"
            >
              {p.name}
            </span>
          ))}
          <span className="w-4 shrink-0" aria-hidden="true" />
        </div>

        {weeks.map((line) => (
          <button
            key={line.week}
            type="button"
            onClick={() => setOpenWeek(line.week)}
            className="flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left transition last:border-b-0 hover:bg-surface-2"
          >
            <span className="w-14 shrink-0 text-sm font-semibold">Wk {line.week}</span>

            {players.map((p, i) => (
              <span
                key={p.id}
                className={`flex-1 text-center font-mono text-sm tabular-nums ${
                  line.winners.includes(p.id) ? 'font-bold text-accent' : ''
                }`}
              >
                {line.points[i]}
              </span>
            ))}

            <span aria-hidden="true" className="w-4 shrink-0 text-right text-xs text-muted">
              ›
            </span>
          </button>
        ))}
      </div>

      {active ? (
        <PickSummaryDialog
          week={active.week}
          players={players}
          rows={active.rows}
          open
          onClose={() => setOpenWeek(null)}
        />
      ) : null}
    </>
  )
}
