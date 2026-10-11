import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { devSaves } from './server/dev/devSaves.js'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Vercel's trusted build environment, not a URL/hostname or editable VITE_* override.
  define: { 'import.meta.env.IDENTITY_PREVIEW': JSON.stringify(process.env.VERCEL_ENV === 'preview') },
  plugins: [
    react(),
    tailwindcss(),
    // npm run dev: /api/items for the fixed TEST Player ID, stored in .dev/saves.json
    devSaves(),
  ],
  resolve: {
    // Production ships Preact (same React API, ~10 KB instead of ~200 KB of react-dom):
    // less to download and far less JavaScript for older phones to parse.
    // `npm run dev` keeps real React so fast refresh works while you build.
    // Escape hatch: NO_PREACT=1 npm run build ships React instead.
    alias: command === 'build' && !process.env.NO_PREACT ? [
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react\/jsx-dev-runtime$/, replacement: 'preact/jsx-dev-runtime' },
      { find: /^react$/, replacement: 'preact/compat' },
    ] : [],
  },
  server: {
    host: true,
  },
}))
