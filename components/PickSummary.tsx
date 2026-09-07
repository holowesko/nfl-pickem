'use client'

import { useEffect, useRef, useState } from 'react'
import { TeamLogo } from './TeamLogo'

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
 * The whole week at a glance: every game, and what each player took.
 *
 * Rows for games that have not kicked off show nothing — the server does not
 * send those picks at all, so there is nothing here to reveal early even to
 * someone reading the page source.
 */
export function PickSummary({
  week,
  players,
  rows,
}: {
  week: number
  players: { id: string; name: string }[]
  rows: SummaryRow[]
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  const revealedCount = rows.filter((r) => r.revealed).length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground"
      >
        Picks Summary
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-labelledby="summary-heading"
        className="m-auto max-h-[85vh] w-[min(32rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/60"
      >
        <div className="flex items-baseline justify-between gap-3 border-b border-border p-4">
          <h2 id="summary-heading" className="text-lg font-bold tracking-tight">
            Week {week} picks
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm font-medium text-muted transition hover:text-foreground"
          >
            Close
          </button>
        </div>

        {/* Player names sit above their column and stay put while the list
            scrolls, so a long slate never loses its headings. */}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2">
          <span className="min-w-0 flex-1 text-[0.7rem] uppercase tracking-wide text-muted">
            Game
          </span>
          {players.map((p) => (
            <span
              key={p.id}
              className="w-12 shrink-0 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-muted"
            >
              {p.name}
            </span>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {rows.map((row) => (
            <div
              key={row.gameId}
              className="flex items-center gap-2 border-b border-border px-4 py-2.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-semibold">
                  {row.away} @ {row.home}
                </p>
                <p className="text-[0.7rem] text-muted">
                  {row.score ?? row.kickoffLabel}
                </p>
              </div>

              {row.revealed ? (
                row.picks.map((pick) => (
                  <div key={pick.playerId} className="w-12 shrink-0">
                    {pick.team ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className={
                            pick.correct === true
                              ? 'rounded-full ring-2 ring-accent'
                              : pick.correct === false
                                ? 'rounded-full opacity-40'
                                : ''
                          }
                        >
                          <TeamLogo abbreviation={pick.team} />
                        </span>
                        {pick.isLock || pick.isUpset ? (
                          <span className="text-[0.6rem] font-bold leading-none">
                            {pick.isLock ? <span className="text-lock">L</span> : null}
                            {pick.isUpset ? <span className="text-upset">U</span> : null}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-center text-xs text-muted" title="No pick">
                        &mdash;
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="w-[calc(3*3rem+1rem)] shrink-0 text-center text-[0.7rem] text-muted">
                  Hidden until kickoff
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="border-t border-border px-4 py-2.5 text-[0.7rem] text-muted">
          {revealedCount} of {rows.length} games revealed. A ring means the pick
          covered; faded means it did not.
        </p>
      </dialog>
    </>
  )
}
