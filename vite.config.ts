import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import Sitemap from 'vite-plugin-sitemap'

// Multi-threaded Stockfish needs SharedArrayBuffer -> cross-origin isolation.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const hostname = env.VITE_SITE_URL?.replace(/\/+$/, '')

  if (!hostname) {
    throw new Error('VITE_SITE_URL must be set to generate the sitemap')
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'site-url',
        transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', hostname),
      },
      Sitemap({
        hostname,
        generateRobotsTxt: true,
      }),
    ],
    server: { headers: isolation },
    preview: { headers: isolation },
  }
})
