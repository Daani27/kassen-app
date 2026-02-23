import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createRequire } from 'module';

// Erlaubt das Importieren der package.json in einem ES-Modul (für die Versionierung)
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        skipWaiting: true,
        clientsClaim: true
      },
      manifest: {
        short_name: 'Kassen App',
        name: 'Kassen App',
        icons: [
          {
            src: `/favicon.svg?v=${pkg.version}`,
            type: 'image/svg+xml',
            sizes: 'any',
            purpose: 'any'
          },
          {
            src: `/favicon.svg?v=${pkg.version}`,
            type: 'image/svg+xml',
            sizes: 'any',
            purpose: 'maskable'
          }
        ],
        start_url: '.',
        display: 'standalone',
        theme_color: '#111827',
        background_color: '#f3f4f6',
        orientation: 'portrait'
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
    __SW_VERSION__: JSON.stringify(pkg.version),
  },
  base: './', // Wichtig für relative Pfade auf mobilen Endgeräten
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: 'all'
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});