/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './*.js',
  ],
  theme: {
    extend: {
      colors: {
        gold:       '#c9a227',
        deepBlack:  '#0b1628',
        navy:       '#1a2c45',
        'navy-dark':'#111d2e',
        nav:        '#1e2d45',
        navDark:    '#162030',
        topbar:     '#1e3a5f',
        panel:      '#f0f4f8',
        accent:     '#27ae60',
        cegreen:    '#27ae60',
      },
      fontFamily: {
        sans:    ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['Roboto Mono', 'monospace'],
        display: ['Cinzel', 'serif'],
      },
    },
  },
  plugins: [],
}
