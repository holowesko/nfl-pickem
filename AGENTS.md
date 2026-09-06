<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes

## What this is

A three-player NFL pick'em pool (Dad, John, Nick). No auth by design: one shared
link, tap your name, cookie remembers it. All picks are public to all players.

## Where the rules live

`lib/scoring.ts` and `lib/time.ts` are the rulebook, written as pure functions
with no database or network access. Every rule change belongs there and needs a
test in the matching `*.test.ts` — run them with `npm test`. Do not scatter
scoring logic into components or route handlers.

Two rules are easy to get wrong and are pinned by tests:

- Monday games lock with the **Sunday** window, not Monday morning.
- The "early kickoff" rule keys off kickoff time (before 10:00am ET), not off a
  country flag, so it covers London, Berlin, Madrid, and anything else odd.

## Time

Every deadline is defined in US Eastern and stored as a UTC instant. Never use
the server's local time zone — `lib/time.ts` has the conversion helpers, and
they are DST-correct.

## Scheduling

Scheduled work runs from GitHub Actions, not Vercel cron (the free plan caps at
two jobs per day). Jobs must be idempotent and tolerant of late runs.
