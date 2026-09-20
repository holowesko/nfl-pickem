import type { MetadataRoute } from 'next'

/**
 * Required for web push on iPhone.
 *
 * Apple does not deliver push to a normal Safari tab: the site has to be added
 * to the Home Screen first, and that is only offered for a site with a
 * manifest. So this is not decoration — without it there are no notifications.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HoloPicks NFL Duel',
    short_name: 'HoloPicks',
    description: 'Season-long NFL picks against the spread.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0d12',
    theme_color: '#175c30',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
