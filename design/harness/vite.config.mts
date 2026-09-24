// =============================================================================
// UI harness — serves the REAL renderer (src/renderer) in a plain browser with a
// mock window.stoneBridge + a synthetic microphone injected first. No Electron,
// no database, no .env, no network: safe for design work and screenshots.
//
//   PATH=~/.local/node-v20.20.2-darwin-arm64/bin:$PATH \
//     node_modules/.bin/vite --config design/harness/vite.config.mts
//   open http://localhost:8030/?s=default   (scenarios: see mock-api.ts)
// =============================================================================

import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = resolve(here, '../..')

// Load the mock before the app's own entry so window.stoneBridge exists first.
// (A head-prepended module script runs before the body's entry module.)
const injectMock: Plugin = {
  name: 'inject-mock-api',
  transformIndexHtml() {
    return [
      {
        tag: 'script',
        attrs: { type: 'module', src: `/@fs${resolve(here, 'mock-api.ts')}` },
        injectTo: 'head-prepend'
      }
    ]
  }
}

export default defineConfig({
  root: resolve(repo, 'src/renderer'),
  plugins: [injectMock, react()],
  resolve: {
    alias: {
      '@renderer': resolve(repo, 'src/renderer/src'),
      '@shared': resolve(repo, 'src/shared')
    }
  },
  css: { postcss: repo },
  server: { port: 8030, strictPort: true, fs: { allow: [repo] } }
})
