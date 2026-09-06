'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { choosePlayer, clearPlayer } from '@/app/actions'
import type { Player } from '@/lib/players'

/**
 * Who is using this device.
 *
 * Tapping a name only proposes it; nothing is saved until the confirmation is
 * accepted. That matters because the choice sticks for a year, and a mis-tap
 * would otherwise quietly attribute a week of picks to the wrong person.
 *
 * Once confirmed the picker is replaced by a greeting — but with a way back.
 * Three people sharing one link on shared devices will eventually need to
 * switch, and clearing cookies is not an answer we want to give anyone.
 */
export function PlayerPicker({
  players,
  currentId,
}: {
  players: Player[]
  currentId?: string
}) {
  const [pending, startTransition] = useTransition()
  const [candidate, setCandidate] = useState<Player | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  // Drive the native dialog from state so Escape and the backdrop still work:
  // `onClose` fires for those too, which clears the candidate.
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (candidate && !el.open) el.showModal()
    else if (!candidate && el.open) el.close()
  }, [candidate])

  const confirmed = players.find((p) => p.id === currentId)

  if (confirmed) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold">Welcome, {confirmed.name}!</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => clearPlayer())}
          className="rounded-lg px-2 py-1 text-xs font-medium text-muted underline underline-offset-2 transition hover:text-foreground disabled:opacity-50"
        >
          Not {confirmed.name}?
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-2" role="group" aria-label="Who are you?">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            disabled={pending}
            onClick={() => setCandidate(player)}
            className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-base font-semibold transition hover:bg-surface-2 disabled:opacity-60"
          >
            {player.name}
          </button>
        ))}
      </div>

      <dialog
        ref={dialog}
        onClose={() => setCandidate(null)}
        aria-labelledby="confirm-heading"
        className="m-auto w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-5 text-foreground backdrop:bg-black/60"
      >
        {candidate ? (
          <div className="flex flex-col gap-4">
            <div>
              <h2 id="confirm-heading" className="text-lg font-bold tracking-tight">
                You&rsquo;re {candidate.name}?
              </h2>
              <p className="mt-1 text-sm text-muted">
                This device will remember you, and your picks will be saved under this
                name.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setCandidate(null)}
                className="flex-1 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold transition hover:bg-surface disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                disabled={pending}
                onClick={() =>
                  startTransition(() => choosePlayer(candidate.id))
                }
                className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? 'Saving…' : `Yes, I'm ${candidate.name}`}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  )
}
