import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [
    react(),
    cesium(),    // Handles Cesium's static assets (workers, textures) automatically
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
      workbox: {
        // Don't try to precache Cesium's large static assets
        globIgnores: ['**/cesium/**'],
      },
    }),
  ],
})
