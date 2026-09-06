'use client'

import { useState, useTransition } from 'react'
import { setPick, clearPick, setLock, setUpset } from '@/app/picks-actions'
import { displaySpread } from '@/lib/slate'
import { underdogSide, type Side } from '@/lib/scoring'
import { LocalTime } from './LocalTime'
import { TeamLogo } from './TeamLogo'

export type OtherPick = {
  playerId: string
  playerName: string
  side: Side
  isLock: boolean
  isUpset: boolean
}

export type GameCardData = {
  id: string
  homeTeam: string
  awayTeam: string
  homeName: string
  awayName: string
  kickoff: string
  kickoffLabel: string
  spreadHome: number | null
  lockedSpreadHome: number | null
  homeScore: number | null
  awayScore: number | null
  final: boolean
  /** Kicked off — picks no longer accepted. */
  locked: boolean
  /** Window closed — the graded spread is fixed, but picks may still be open. */
  spreadLocked: boolean
}

export function GameCard({
  game,
  mySide,
  isLock,
  isUpset,
  others,
  othersIn,
  canPick,
}: {
  game: GameCardData
  mySide: Side | null
  isLock: boolean
  isUpset: boolean
  others: OtherPick[]
  /** Count of other players who have picked but are still hidden. */
  othersIn: number
  canPick: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Show the number this pick will actually be graded on. Once the window has
  // closed that is the frozen line — which matters more now that picks stay
  // open past the freeze, because someone picking Sunday afternoon must see the
  // number they are playing, not one that has drifted since.
  const spread = game.spreadLocked
    ? (game.lockedSpreadHome ?? game.spreadHome)
    : game.spreadHome
  const dog = underdogSide(spread)
  const noLine = spread === null
  const interactive = canPick && !game.locked && !noLine

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null)
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) setError(result.error)
    })
  }

  const choose = (side: Side) => {
    if (!interactive) return
    run(() => (mySide === side ? clearPick(game.id) : setPick(game.id, side)))
  }

  const sides: { side: Side; team: string; name: string; score: number | null }[] = [
    { side: 'away', team: game.awayTeam, name: game.awayName, score: game.awayScore },
    { side: 'home', team: game.homeTeam, name: game.homeName, score: game.homeScore },
  ]

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{game.kickoffLabel}</span>
        {game.final ? (
          <span className="font-semibold text-foreground">Final</span>
        ) : game.locked ? (
          <span>Kicked off &middot; picks closed</span>
        ) : (
          // Picks stay open until this game kicks off, so the countdown that
          // matters is this game's own, not its window's.
          <LocalTime iso={game.kickoff} etLabel="" verb="picks close" relativeOnly />
        )}
      </div>

      <div className="grid gap-2">
        {sides.map(({ side, team, name, score }) => {
          const selected = mySide === side
          const isDog = dog === side

          return (
            <button
              key={side}
              type="button"
              disabled={!interactive || pending}
              aria-pressed={selected}
              onClick={() => choose(side)}
              className={[
                'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition',
                selected
                  ? 'border-transparent bg-accent text-accent-fg'
                  : 'border-border bg-surface-2',
                interactive ? 'hover:border-accent' : 'cursor-default opacity-90',
              ].join(' ')}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <TeamLogo abbreviation={team} />
                <span className="truncate text-sm font-medium">{name}</span>
              </span>

              <span className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm tabular-nums">
                  {/* Only the favorite shows the number; the dog is implied. */}
                  {displaySpread(spread, side) ??
                    (isDog ? (
                      // On a selected row the muted grey sits on the accent
                      // fill and all but disappears, so step the row's own
                      // foreground back instead of recolouring it.
                      <span className={selected ? 'text-xs opacity-70' : 'text-xs text-muted'}>
                        dog
                      </span>
                    ) : null)}
                </span>
                {game.final && score !== null ? (
                  <span className="w-6 text-right font-mono text-sm font-bold">{score}</span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>

      {noLine && !game.final ? (
        <p className="mt-2 text-xs text-muted">No line posted yet — check back later.</p>
      ) : null}

      {interactive && mySide ? (
        <div className="mt-2 flex gap-2">
          <BonusToggle
            label="Lock"
            title="Wins outright, spread be damned (+2)"
            active={isLock}
            disabled={pending}
            tone="lock"
            onClick={() => run(() => setLock(game.id, !isLock))}
          />
          <BonusToggle
            label="Upset"
            title={
              dog === mySide
                ? 'Your underdog wins outright (+3)'
                : 'Only an underdog can be your Upset'
            }
            active={isUpset}
            disabled={pending || dog !== mySide}
            tone="upset"
            onClick={() => run(() => setUpset(game.id, !isUpset))}
          />
        </div>
      ) : null}

      {(isLock || isUpset) && !interactive ? (
        <div className="mt-2 flex gap-2">
          {isLock ? <Badge tone="lock">Lock</Badge> : null}
          {isUpset ? <Badge tone="upset">Upset</Badge> : null}
        </div>
      ) : null}

      {others.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2">
          {others.map((other) => (
            <span
              key={other.playerId}
              className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted"
            >
              {other.playerName}{' '}
              <span className="font-mono font-semibold text-foreground">
                {other.side === 'home' ? game.homeTeam : game.awayTeam}
              </span>
              {other.isLock ? <span className="ml-1 text-lock">L</span> : null}
              {other.isUpset ? <span className="ml-1 text-upset">U</span> : null}
            </span>
          ))}
        </div>
      ) : othersIn > 0 ? (
        // Who has picked is fair game; what they picked is not, until kickoff.
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
          {othersIn === 1 ? '1 other is in' : `${othersIn} others are in`} &middot; picks
          revealed at kickoff
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </div>
  )
}

function BonusToggle({
  label,
  title,
  active,
  disabled,
  tone,
  onClick,
}: {
  label: string
  title: string
  active: boolean
  disabled: boolean
  tone: 'lock' | 'upset'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={[
        'rounded-md border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40',
        active
          ? tone === 'lock'
            ? 'border-lock bg-lock/15 text-lock'
            : 'border-upset bg-upset/15 text-upset'
          : 'border-border bg-surface-2 text-muted',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function Badge({ tone, children }: { tone: 'lock' | 'upset'; children: React.ReactNode }) {
  return (
    <span
      className={[
        'rounded-md border px-2 py-0.5 text-xs font-semibold',
        tone === 'lock'
          ? 'border-lock bg-lock/15 text-lock'
          : 'border-upset bg-upset/15 text-upset',
      ].join(' ')}
    >
      {children}
    </span>
  )
}
