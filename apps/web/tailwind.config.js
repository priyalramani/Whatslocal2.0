/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0f766e', // teal-700
          dark: '#0b5650',
          light: '#5eead4',
          50: '#f0fdfa',
          100: '#ccfbf1',
        },
        accent: {
          DEFAULT: '#f59e0b', // amber-500 — premium warm touch
          soft: '#fef3c7',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)',
      },
    },
  },
  plugins: [],
};
