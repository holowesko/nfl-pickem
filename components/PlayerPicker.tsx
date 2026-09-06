'use client'

import { useTransition } from 'react'
import { choosePlayer } from '@/app/actions'
import type { Player } from '@/lib/players'

export function PlayerPicker({
  players,
  currentId,
}: {
  players: Player[]
  currentId?: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex gap-2" role="group" aria-label="Who are you?">
      {players.map((player) => {
        const active = player.id === currentId
        return (
          <button
            key={player.id}
            type="button"
            disabled={pending}
            aria-pressed={active}
            onClick={() => startTransition(() => choosePlayer(player.id))}
            className={[
              'flex-1 rounded-xl px-4 py-3 text-base font-semibold transition',
              'border disabled:opacity-60',
              active
                ? 'bg-accent text-accent-fg border-transparent'
                : 'bg-surface text-foreground border-border hover:bg-surface-2',
            ].join(' ')}
          >
            {player.name}
          </button>
        )
      })}
    </div>
  )
}
