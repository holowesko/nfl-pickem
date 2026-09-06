/**
 * Fill the local development database with the current week's real games.
 *
 *   npm run seed
 *
 * Needs `npm run dev` already running in another terminal — this just asks the
 * running app to do its normal sync, so it exercises the same code path the
 * scheduled job uses in production.
 */
import { readFileSync } from 'node:fs'

const PORT = process.env.PORT ?? '3002'
const URL = `http://localhost:${PORT}/api/cron/sync`

function devSecret() {
  try {
    const env = readFileSync('.env.local', 'utf8')
    const match = env.match(/^CRON_SECRET\s*=\s*"?([^"\r\n]+)"?/m)
    if (match) return match[1]
  } catch {
    // No .env.local yet — fall through to the default below.
  }
  return 'dev-secret'
}

const response = await fetch(URL, {
  method: 'POST',
  headers: { authorization: `Bearer ${devSecret()}` },
}).catch(() => null)

if (!response) {
  console.error(
    `\nCould not reach ${URL}\n\n` +
      `Start the app first, in another terminal:\n\n  npm run dev\n\n` +
      `then run this again.\n`
  )
  process.exit(1)
}

const body = await response.json().catch(() => ({}))

if (!response.ok || body.ok === false) {
  console.error(`\nSync failed (${response.status}):`, body.error ?? body, '\n')
  process.exit(1)
}

console.log(
  `\nLoaded ${body.games} games for ${body.season} week ${body.week}.` +
    `\nOpen http://localhost:${PORT}\n`
)
