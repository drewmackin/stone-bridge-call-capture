import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Production-only CSP hardening: drop 'unsafe-inline' from script-src in the
// BUILT index.html. Dev keeps it — the React-refresh preamble Vite injects is
// an inline script. blob: and every other directive are left untouched.
function stripInlineScriptCsp(): Plugin {
  return {
    name: 'stone-bridge:csp-no-inline-script',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(/script-src[^;"]*/, (directive) => directive.replace("'unsafe-inline' ", ''))
    }
  }
}

// electron-vite drives three separate builds: main (Node), preload (Node bridge),
// and renderer (the React UI bundled by Vite). Native + Node-only deps are
// externalized so they load from node_modules at runtime instead of being bundled.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), stripInlineScriptCsp()]
  }
})
