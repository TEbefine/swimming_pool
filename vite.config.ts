import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
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
