'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { chooseBonus, removeBonus } from '@/app/picks-actions'
import { TeamLogo } from './TeamLogo'
import type { BonusKind, Side } from '@/lib/scoring'

export type BonusOption = {
  gameId: string
  side: Side
  /** Abbreviation, for the logo. */
  team: string
  name: string
  /** e.g. "vs NE" or "@ SEA", with the line. */
  detail: string
}

/**
 * The Lock or the Upset for the week, chosen from a dropdown of teams.
 *
 * A custom listbox rather than a native <select>, because a native one cannot
 * render the logos — and the logos are most of what makes a long list of teams
 * quick to scan.
 */
export function BonusPicker({
  kind,
  label,
  points,
  hint,
  options,
  selected,
  season,
  week,
  canPick,
}: {
  kind: BonusKind
  label: string
  points: string
  hint: string
  options: BonusOption[]
  selected: BonusOption | null
  season: number
  week: number
  canPick: boolean
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const root = useRef<HTMLDivElement>(null)

  // Close on Escape or a click anywhere else.
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null)
    setOpen(false)
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) setError(result.error)
    })
  }

  const tone = kind === 'lock' ? 'text-lock' : 'text-upset'
  const disabled = !canPick || pending || options.length === 0

  return (
    <div ref={root} className="relative rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className={`font-mono text-xs font-semibold ${tone}`}>{points}</p>
      </div>

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-left transition hover:border-accent disabled:opacity-60 disabled:hover:border-border"
      >
        {selected ? (
          <>
            <TeamLogo abbreviation={selected.team} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {selected.name}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-muted">
            {options.length === 0 ? 'Nothing available' : 'Choose a team'}
          </span>
        )}
        <span aria-hidden="true" className="shrink-0 text-xs text-muted">
          ▾
        </span>
      </button>

      <p className="mt-1.5 text-[0.7rem] leading-snug text-muted">{hint}</p>

      {error ? <p className="mt-1.5 text-xs text-red-500">{error}</p> : null}

      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {selected ? (
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => run(() => removeBonus(kind, season, week))}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted transition hover:bg-surface-2"
            >
              Clear selection
            </button>
          ) : null}

          {options.map((option) => {
            const isSelected =
              selected?.gameId === option.gameId && selected?.side === option.side

            return (
              <button
                key={`${option.gameId}-${option.side}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => run(() => chooseBonus(kind, option.gameId, option.side))}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-surface-2 ${
                  isSelected ? 'bg-surface-2' : ''
                }`}
              >
                <TeamLogo abbreviation={option.team} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{option.name}</span>
                  <span className="block truncate text-xs text-muted">{option.detail}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
