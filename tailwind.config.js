/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Stone Bridge brand
        navy: {
          DEFAULT: '#091428',
          900: '#091428',
          800: '#0e1d3a',
          700: '#16294f',
          600: '#1f3766'
        },
        gold: {
          DEFAULT: '#B59862',
          400: '#c7ad7e',
          500: '#B59862',
          600: '#9c8150'
        },
        parchment: '#f7f5f0'
      },
      fontFamily: {
        // Serif display for headers (private-wealth feel); clean sans for body/data.
        display: ['"Cormorant Garamond"', 'Georgia', 'ui-serif', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        panel: '0 1px 3px rgba(9,20,40,0.08), 0 8px 24px rgba(9,20,40,0.06)'
      }
    }
  },
  plugins: []
}
