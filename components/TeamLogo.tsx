'use client'

import { useState } from 'react'
import Image from 'next/image'
import { teamLogo } from '@/lib/logos'

/**
 * A team's logo, with the abbreviation as a fallback.
 *
 * One image for both themes, deliberately. ESPN's `500-dark` variant is not a
 * reliable counterpart to `500`: it is dark ink for most teams, which vanishes
 * on our dark card, but white for others like the Rams, which vanishes on the
 * light one. The full-colour mark is the only variant that reads on both.
 *
 * The alt text is empty on purpose: the team name sits immediately beside it,
 * so announcing the logo too would just repeat.
 */
export function TeamLogo({ abbreviation }: { abbreviation: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span className="w-7 shrink-0 text-center font-mono text-sm font-bold">
        {abbreviation}
      </span>
    )
  }

  return (
    <Image
      src={teamLogo(abbreviation)}
      alt=""
      width={28}
      height={28}
      onError={() => setFailed(true)}
      className="h-7 w-7 shrink-0 object-contain"
    />
  )
}
