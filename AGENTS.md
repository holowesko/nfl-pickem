<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes

## What this is

A three-player NFL pick'em pool (Dad, John, Nick). No auth by design: one shared
link, tap your name, cookie remembers it.

Each game's picks are hidden from the other players until that game kicks off.
That filtering MUST happen server-side, before the props are built — see
`app/page.tsx`. Hiding picks inside a component still ships them to the browser,
where anyone can read them out of the page source.

## Where the rules live

`lib/scoring.ts` and `lib/time.ts` are the rulebook, written as pure functions
with no database or network access. Every rule change belongs there and needs a
test in the matching `*.test.ts` — run them with `npm test`. Do not scatter
scoring logic into components or route handlers.

## Two deadlines, never one

This is the single easiest thing to break. There are two distinct instants and
they must not be merged:

- `picksCloseAt` / `arePicksClosed` — **kickoff**, per game. Governs whether a
  pick may be made or changed.
- `spreadLockTimeFor` / `isSpreadLocked` — the **window** deadline, per group.
  Governs which spread grades the pick, and the slate's grouping.

They were one function once, and splitting them was a deliberate rule change.
Collapsing them again would either grade players on a line they never saw, or
close picks hours before kickoff.

Other rules that are easy to get wrong and are pinned by tests:

- Monday games freeze their line with the **Sunday** window, not Monday morning
  — but stay pickable until Monday night kickoff.
- The "early kickoff" rule keys off kickoff time (before 10:00am ET), not off a
  country flag, so it covers London, Berlin, Madrid, and anything else odd.
- Everything else freezes at 10am ET on its own day. Do not hard-code the set of
  weekdays: the 2026 season opens on a Wednesday, and Friday and holiday games
  happen too.
- The UI must show the **frozen** line once the window has closed, since players
  keep picking after that point.

## The Lock and the Upset

They are weekly selections in their own right, in `weekly_bonuses`, not flags on
a pick. A player may Lock a team without having taken that game against the
spread, and scoring reflects that: `scorePick` returns the spread point only,
and `scoreBonus` handles the rest. Do not fold them back into `picks`.

One of each per week is enforced by the table's primary key
(player, season, week, kind), so writing a bonus is a plain upsert.

The Upset list is built from underdogs only, so it is legal by construction —
but `validateBonus` still checks server-side, because a Server Action is
reachable by direct POST.

## Profile photos

Stored in `player_avatars` as base64 text, not in a blob service — three photos
at a couple of kilobytes each do not justify another service and another
credential. `AvatarUploader` centre-crops and resizes to 192px in the browser
first, so a multi-megabyte phone photo never reaches the server.

They are served from `/api/avatar/[playerId]`, not inlined as data URIs, so the
browser caches them instead of re-downloading on every render. Callers append
`?v=<version>` from `getAvatarVersions()`; that is what makes it safe to send
`immutable` cache headers.

## Theming

Three states, not two: no choice yet (follow the device), forced light, forced
dark. `app/globals.css` encodes that as bare `:root` for light, a
`prefers-color-scheme` block guarded with `:root:not([data-theme="light"])`, and
a `:root[data-theme="dark"]` block last. Breaking that order means a player who
picks light gets dark back on a dark phone.

Every colour must be defined in the bare `:root` block. A token that only exists
inside the media query or an attribute block is undefined in the other states.

Keep the `color-scheme` declarations alongside the tokens. Without them the
browser applies its own dark adjustments over our palette, and forced light on a
dark device renders wrong even though the computed values are correct.

The theme is stored in a cookie and applied server-side in `app/layout.tsx`, so
there is no flash of the wrong theme. Do not move it to localStorage.

## Time

Every deadline is defined in US Eastern and stored as a UTC instant. Never use
the server's local time zone — `lib/time.ts` has the conversion helpers, and
they are DST-correct.

## Spreads

One convention, everywhere: `spreadHome` is from the **home team's**
perspective. `-3.5` means the home team is favored by 3.5. ESPN uses the same
convention, so the number passes through `lib/espn.ts` unchanged.

`spreadHome` is the live line and moves all week. `lockedSpreadHome` is the
frozen snapshot that actually grades the pick. Scoring must always read the
locked one.

## Data

ESPN's public scoreboard is the only external source, and one request carries
the schedule, the spreads, and the scores. There is no API key. Do not add a
second odds provider without a reason — reconciling two sources is how the
spread convention gets broken.

## Database

Production is Neon Postgres via `DATABASE_URL`. With that unset in development,
`lib/db.ts` falls back to PGlite (WASM Postgres) persisted in `.pglite/`, so the
app runs with no setup. Both backends are used through the same tagged-template
`Sql` type — keep it that way, and keep `db/schema.sql` idempotent, because it
is re-applied on every local boot.

PGlite must stay in `serverExternalPackages` in `next.config.ts`; bundling it
breaks its runtime file access.

## Scheduling

Scheduled work runs from GitHub Actions, not Vercel cron (the free plan caps at
two jobs per day). `POST /api/cron/sync` must stay idempotent and tolerant of
late runs.
