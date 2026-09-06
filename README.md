# Holowesko Pick&rsquo;em

A season-long NFL pick&rsquo;em pool for three people, with no accounts and no
passwords. One link, tap your name, make your picks.

## The game

| | Points |
|---|---|
| Pick a game correctly against the spread | 1 |
| **Lock of the Week** — your team wins outright | +2 |
| **Upset of the Week** — your underdog wins outright | +3 |

Bonuses stack on the spread point, so a Lock that also covers is worth 3 and an
upset that lands is worth 4. A push scores 0 for everyone. Unpicked games score
0 — nothing is auto-picked. One Lock and one Upset per week, both optional.
Most points across the 18-week regular season wins.

### Deadlines

All deadlines are US Eastern, shown to each player in their own time zone.

| Games | Locks at |
|---|---|
| Sunday and Monday | 10:00am ET Sunday |
| Any other day | 10:00am ET that morning |
| Anything kicking before 10:00am ET | 7:00am ET that morning |

The middle row is written as a general rule rather than a list of weekdays
because the schedule does not cooperate — the 2026 season opens on a
*Wednesday*. The last row is what covers the international games, and it keys
off kickoff time rather than a country flag so it also catches any other
unusually early start.

The graded spread is the one in place when the game&rsquo;s window locked, not
the one showing when the pick was made — so all three players are always graded
on the same number.

## Local setup

```bash
npm install
npm run dev
```

That is the whole thing. With no `DATABASE_URL` set, the app runs against an
embedded [PGlite](https://pglite.dev) database — real Postgres compiled to
WASM, persisted to `.pglite/` — so there is no account to create and nothing to
install. The schema is applied automatically on boot.

To load the current week's games and lines, with the dev server running:

```bash
curl -X POST http://localhost:3002/api/cron/sync -H "Authorization: Bearer dev-secret"
```

(`CRON_SECRET=dev-secret` lives in `.env.local`.)

## Tests

```bash
npm test
```

The scoring rules, the deadline rules, and the ESPN parser are pure functions
with no database or network dependency, so the suite runs in under a second.

There is also an end-to-end check that pulls the live slate, stores it, makes
picks, freezes a line and scores a game against the embedded database:

```bash
npx tsx scripts/verify.mts
```

## How the data gets in

Everything — schedule, point spreads, and final scores — comes from ESPN's
public scoreboard endpoint in a single request. No API key, no rate limit, no
second source to reconcile.

ESPN reports the spread from the home team's perspective, which is the same
convention used throughout this codebase: `-3.5` means the home team is favored
by 3.5, `+3.5` means they are getting points.

One scheduled job, `POST /api/cron/sync`, does all of it and is safe to run at
any time:

1. upsert the week's games
2. record a line snapshot if the spread moved
3. freeze the graded line for any window whose deadline has passed
4. update scores and mark games final

Vercel's free plan allows only two cron jobs, once per day each, which is not
enough for a 7am lock, a 10am lock, and score updates. The schedule runs from
GitHub Actions instead (`.github/workflows/poll.yml`), every 30 minutes.

Scheduled runs on GitHub can drift by several minutes. That is why the graded
line is defined as *the last snapshot at or before the lock time* rather than
*whatever we fetched at exactly 10:00* — frequent polling matters, punctuality
does not.

### Required secrets

| Name | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel | Neon connection string |
| `CRON_SECRET` | Vercel + GitHub | Shared bearer token for the sync endpoint |
| `APP_URL` | GitHub | Deployed base URL, e.g. `https://picks.vercel.app` |

## Privacy

There is no authentication. The pool lives at an unlisted URL and is marked
`noindex`. Everyone can see everyone&rsquo;s picks at all times, by design.
