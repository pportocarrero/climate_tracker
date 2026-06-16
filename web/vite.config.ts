import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name:             'ENSO Viewer',
        short_name:       'ENSO',
        description:      'Real-time El Niño / La Niña climate dashboard',
        theme_color:      '#0a1929',
        background_color: '#0a1929',
        display:          'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  define: {
    // Required for Deck.gl
    'process.env': {},
  },
})
