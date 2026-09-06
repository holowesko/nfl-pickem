import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * PGlite ships a WASM build of Postgres and reads its own files from disk at
   * runtime. Bundling it breaks that, so it is loaded with a native require
   * instead. It is only ever used as the local development database — in
   * production DATABASE_URL is set and the Neon driver is used.
   */
  serverExternalPackages: ['@electric-sql/pglite'],

  images: {
    // Team logos. The source files are 500px squares that we draw at 28px, so
    // letting Next resize them is worth the config.
    remotePatterns: [new URL('https://a.espncdn.com/i/teamlogos/nfl/**')],
  },
}

export default nextConfig
