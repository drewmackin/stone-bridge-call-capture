/** @type {import('tailwindcss').Config} */

// Colors resolve to the OKLCH tokens defined on :root in src/renderer/src/index.css,
// so every utility (bg-gold-600/40 etc.) stays on the one designed palette.
const token = (name) => `oklch(var(--${name}) / <alpha-value>)`

module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Foundation (warm neutral — never pure #fff / #000)
        canvas: token('canvas'),
        surface: token('surface'),
        sunken: token('sunken'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        // Brand chrome
        navy: { DEFAULT: token('navy'), 2: token('navy-2'), 3: token('navy-3') },
        // Functional accent ramp (Stone Bridge gold = 600)
        gold: {
          50: token('gold-50'),
          100: token('gold-100'),
          200: token('gold-200'),
          300: token('gold-300'),
          400: token('gold-400'),
          500: token('gold-500'),
          600: token('gold-600'),
          700: token('gold-700'),
          800: token('gold-800'),
          900: token('gold-900')
        },
        // Semantic
        ok: { DEFAULT: token('ok'), bg: token('ok-bg'), dot: token('ok-dot') },
        warn: { DEFAULT: token('warn'), bg: token('warn-bg'), dot: token('warn-dot') },
        danger: { DEFAULT: token('danger'), bg: token('danger-bg'), solid: token('danger-solid') },
        info: { DEFAULT: token('info'), bg: token('info-bg') },
        rec: token('rec')
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        // Wordmark only — the brand's private-wealth serif (macOS "New York").
        brand: ['ui-serif', '"New York"', 'Georgia', 'serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace']
      },
      borderRadius: {
        DEFAULT: '10px',
        card: '10px'
      },
      boxShadow: {
        card: '0 1px 2px oklch(var(--navy) / 0.05), 0 4px 16px oklch(var(--navy) / 0.04)',
        pop: '0 2px 6px oklch(var(--navy) / 0.08), 0 16px 40px oklch(var(--navy) / 0.16)'
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)'
      }
    }
  },
  plugins: []
}
