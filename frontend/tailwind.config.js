/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        clinic: {
          50: '#eef9ff',
          100: '#d9f0ff',
          500: '#0ea5e9',
          700: '#0369a1',
          950: '#082f49'
        }
      },
      boxShadow: {
        portal: '0 24px 80px rgba(15, 23, 42, 0.12)'
      }
    }
  },
  plugins: []
}
