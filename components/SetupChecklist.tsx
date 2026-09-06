const steps = [
  {
    title: 'Create a Neon Postgres database',
    detail:
      'neon.tech, free tier. Copy the connection string into DATABASE_URL in .env.local.',
  },
  {
    title: 'Apply the schema',
    detail: 'psql "$DATABASE_URL" -f db/schema.sql',
  },
  {
    title: 'Get an odds API key',
    detail:
      'the-odds-api.com, free tier. Put it in ODDS_API_KEY. Schedules and scores come from ESPN and need no key.',
  },
  {
    title: 'Set a cron secret',
    detail:
      'Any long random string in CRON_SECRET, matching the GitHub Actions secret of the same name.',
  },
]

export function SetupChecklist() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Almost there</h1>
        <p className="mt-2 text-muted">
          The app is scaffolded but not yet connected to a database. Four things left:
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-xl border border-border bg-surface p-4"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{step.title}</p>
              <p className="mt-1 break-words font-mono text-xs text-muted">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
