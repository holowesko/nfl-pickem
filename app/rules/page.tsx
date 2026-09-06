import { POINTS_SPREAD, POINTS_LOCK_BONUS, POINTS_UPSET_BONUS } from '@/lib/scoring'

export const metadata = { title: 'Rules · HoloPicks Duel' }

const scoring = [
  {
    name: 'Every game',
    points: `${POINTS_SPREAD} pt`,
    detail: 'Pick the winner against the spread. Pick as many or as few as you like.',
  },
  {
    name: 'Lock of the Week',
    points: `+${POINTS_LOCK_BONUS} pts`,
    detail:
      'One team you think wins outright, spread be damned. Stacks on top of the spread point, so a Lock that also covers is worth 3.',
  },
  {
    name: 'Upset of the Week',
    points: `+${POINTS_UPSET_BONUS} pts`,
    detail:
      'One underdog you think wins outright. Also stacks, so an upset that lands is worth 4. The team must be an underdog on the graded line.',
  },
]

const lineFreezes = [
  ['Sunday and Monday games', '10:00am ET Sunday'],
  ['Any other day', '10:00am ET that morning'],
  ['Anything kicking before 10:00am ET', '7:00am ET that morning'],
]

export default function RulesPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Rules</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Scoring</h2>
        {scoring.map((row) => (
          <div key={row.name} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-semibold">{row.name}</p>
              <p className="font-mono text-sm text-accent">{row.points}</p>
            </div>
            <p className="mt-1 text-sm text-muted">{row.detail}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Pick deadline
        </h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="font-semibold">Each game closes at its own kickoff.</p>
          <p className="mt-1 text-sm text-muted">
            Nothing closes early. A Monday night game can be picked on Monday night, and
            a 4:25 game can be picked at 4:24. Whatever you haven&rsquo;t picked by
            kickoff simply scores 0.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          When the line freezes
        </h2>
        <p className="text-sm text-muted">
          Separate from the pick deadline. The spread stops moving earlier so that all
          three of you are graded on the same number, whenever you got your pick in.
        </p>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {lineFreezes.map(([when, lock], i) => (
            <div
              key={when}
              className={`flex items-center justify-between gap-4 p-4 text-sm ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              <span>{when}</span>
              <span className="font-mono text-muted">{lock}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted">
          Once a line has frozen, the number shown on the card is the one you will be
          graded on — so what you see when you pick is always what you get.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          The fine print
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>A push — the result landing exactly on the number — scores 0 for everyone.</li>
          <li>Miss a kickoff and that game simply scores 0. Nothing is auto-picked.</li>
          <li>The Lock and the Upset are optional, and may both sit on the same game.</li>
          <li>
            Each game&rsquo;s picks are hidden until that game kicks off. You can see who
            is in, never what they took. Then everything opens up.
          </li>
          <li>Most points across the 18-week regular season wins. A tie is a shared title.</li>
        </ul>
      </section>
    </div>
  )
}
