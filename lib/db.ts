import { neon } from '@neondatabase/serverless'

/**
 * A row as it comes back from Postgres. The column types are only known to the
 * schema, so this is a genuine `any` boundary — every consumer narrows it
 * through the converters in queries.ts rather than trusting it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>

/**
 * A tagged template that runs a parameterised query and returns rows. Both
 * backends below present exactly this shape, so nothing above this file knows
 * or cares which one is in use.
 */
export type Sql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Row[]>

const hasNeon = Boolean(process.env.DATABASE_URL)
const isProduction = process.env.NODE_ENV === 'production'

/**
 * In production we talk to Neon. In local development, with no DATABASE_URL
 * set, we fall back to PGlite — real Postgres compiled to WASM, running in
 * process and persisting to .pglite/ — so the app is runnable straight after
 * `npm install` with no account to create and nothing to install.
 */
export const isDatabaseConfigured = hasNeon || !isProduction

/**
 * Cached on globalThis rather than in a module variable on purpose.
 *
 * Next.js can load this module into more than one server bundle — a Route
 * Handler and a page do not necessarily share a module registry — and a plain
 * module-level variable would then give each of them its own connection. With
 * Neon that is merely wasteful, but PGlite keeps an in-process page cache over
 * a local directory, so two instances silently diverge: a write through the
 * sync endpoint would not be visible to the page rendering the slate.
 */
const globalForDb = globalThis as typeof globalThis & { __pickemDb?: Promise<Sql> }

export function db(): Promise<Sql> {
  globalForDb.__pickemDb ??= connect()
  return globalForDb.__pickemDb
}

async function connect(): Promise<Sql> {
  if (hasNeon) {
    const sql = neon(process.env.DATABASE_URL!)
    return ((strings, ...values) => sql(strings, ...values) as Promise<Row[]>) as Sql
  }

  if (isProduction) {
    throw new Error(
      'DATABASE_URL is not set. Add your Neon connection string to the environment.'
    )
  }

  return embeddedPostgres()
}

async function embeddedPostgres(): Promise<Sql> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')

  const pg = await PGlite.create({ dataDir: join(process.cwd(), '.pglite') })

  // The schema is written to be idempotent, so applying it on every boot keeps
  // a local database in step with the checked-in DDL.
  const schema = await readFile(join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  await pg.exec(schema)

  return async (strings, ...values) => {
    const text = strings.reduce(
      (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''),
      ''
    )
    const result = await pg.query<Row>(text, values as unknown[])
    return result.rows
  }
}

/**
 * Postgres `numeric` arrives over the wire as a string so precision is not
 * silently lost. Spreads are small halves and wholes, so a float is fine — but
 * the conversion has to be deliberate, because `Number(null)` is 0 and a
 * missing line is emphatically not a pick-em.
 */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
