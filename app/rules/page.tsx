import { POINTS_SPREAD, POINTS_LOCK_BONUS, POINTS_UPSET_BONUS } from '@/lib/scoring'

export const metadata = { title: 'Rules · Pick’em' }

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

const deadlines = [
  ['Thursday games', '10:00am ET Thursday'],
  ['Saturday games', '10:00am ET Saturday'],
  ['Sunday and Monday games', '10:00am ET Sunday'],
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Deadlines</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {deadlines.map(([when, lock], i) => (
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
          The spread you are graded on is the one in place when your game&rsquo;s window locks
          — not the one showing when you made the pick. Lines move; the app flags it when
          one of yours does.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          The fine print
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>A push — the result landing exactly on the number — scores 0 for everyone.</li>
          <li>Miss a deadline and those games simply score 0. Nothing is auto-picked.</li>
          <li>The Lock and the Upset are optional, and may both sit on the same game.</li>
          <li>Everyone can see everyone&rsquo;s picks, at all times. Pick accordingly.</li>
          <li>Most points across the 18-week regular season wins. A tie is a shared title.</li>
        </ul>
      </section>
    </div>
  )
}
