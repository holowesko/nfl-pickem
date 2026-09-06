import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * PGlite ships a WASM build of Postgres and reads its own files from disk at
   * runtime. Bundling it breaks that, so it is loaded with a native require
   * instead. It is only ever used as the local development database — in
   * production DATABASE_URL is set and the Neon driver is used.
   */
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default nextConfig
