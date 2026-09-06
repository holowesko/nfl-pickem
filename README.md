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
| Thursday | 10:00am ET Thursday |
| Saturday | 10:00am ET Saturday |
| Sunday and Monday | 10:00am ET Sunday |
| Anything kicking before 10:00am ET | 7:00am ET that morning |

That last row is what covers the international games. It is written as a
kickoff-time rule rather than a "London" flag so it also catches any other
unusually early start.

The graded spread is the one in place when the game&rsquo;s window locked, not
the one showing when the pick was made — so all three players are always graded
on the same number.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL and ODDS_API_KEY
psql "$DATABASE_URL" -f db/schema.sql
npm run dev
```

## Tests

The scoring and deadline rules are pure functions with no database or network
dependency, so they can be run directly:

```bash
npm test
```

## How the data gets in

- **Schedule and scores** come from ESPN&rsquo;s public endpoints. No key needed.
- **Point spreads** come from [The Odds API](https://the-odds-api.com) free tier.

Vercel&rsquo;s free plan allows only two cron jobs, once per day each, which is
not enough for a 7am lock, a 10am lock, and score updates. The schedule runs
from GitHub Actions instead (`.github/workflows/poll.yml`), which is free and
unmetered for this volume.

Scheduled runs on GitHub can drift by several minutes. That is why the graded
line is defined as *the last snapshot at or before the lock time* rather than
*whatever we fetched at exactly 10:00* — frequent polling matters, punctuality
does not.

### Required secrets

Set these in both Vercel (environment variables) and GitHub (repository
secrets, for the workflow):

| Name | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel | Neon connection string |
| `ODDS_API_KEY` | Vercel | Point spreads |
| `CRON_SECRET` | Vercel + GitHub | Shared bearer token for the cron endpoints |
| `APP_URL` | GitHub | Deployed base URL, e.g. `https://picks.vercel.app` |

## Privacy

There is no authentication. The pool lives at an unlisted URL and is marked
`noindex`. Everyone can see everyone&rsquo;s picks at all times, by design.
