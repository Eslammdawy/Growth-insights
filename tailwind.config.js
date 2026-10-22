/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'Roboto',
          '"Noto Sans Arabic"',
          '"Segoe UI Arabic"',
          'Tahoma',
          'sans-serif',
        ],
      },
      colors: {
        // Color-blind-safe growth palette (blue / orange, Okabe-Ito inspired)
        up: { DEFAULT: '#0072B2', light: '#56B4E9' },
        down: { DEFAULT: '#D55E00', light: '#E69F00' },
      },
      boxShadow: {
        glass: '0 8px 32px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
};
