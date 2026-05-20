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
        blue:       '#00f2ff',
        deepBlack:  '#0b1628',
        navy:       '#1a2c45',
        'navy-dark':'#111d2e',
        panel:      'rgba(11,22,40,0.97)',
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
