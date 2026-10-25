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
      keyframes: {
        indeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '50%': { transform: 'translateX(30%) scaleX(0.7)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
      animation: {
        indeterminate: 'indeterminate 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [
    ({ addBase, theme }) => {
      addBase({
        ':root': {
          '--color-up': theme('colors.up.DEFAULT'),
          '--color-up-light': theme('colors.up.light'),
          '--color-down': theme('colors.down.DEFAULT'),
          '--color-down-light': theme('colors.down.light'),
        },
      });
    },
  ],
};
