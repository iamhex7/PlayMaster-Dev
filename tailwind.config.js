/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        casino: {
          green: '#2d4a3e',
          'green-dark': '#1a2f28',
          gold: '#d4a853',
          'gold-light': '#e8c87a',
          cream: '#f5f0e1',
          dark: '#1a1f2e',
          panel: 'rgba(26, 31, 46, 0.85)',
        },
      },
    },
  },
  plugins: [],
}
