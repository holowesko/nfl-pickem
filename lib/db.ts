import { neon } from '@neondatabase/serverless'

/**
 * The app runs read-only-ish and low-traffic (three people, a few dozen page
 * views a week), so a plain serverless HTTP client is plenty — no pooling
 * needed.
 */
export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL)

let client: ReturnType<typeof neon> | null = null

export function sql() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.'
    )
  }
  client ??= neon(process.env.DATABASE_URL)
  return client
}
