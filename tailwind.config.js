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
        // Vibrant, high-contrast growth palette (Emerald / Rose)
        up: { DEFAULT: '#059669', light: '#34D399', vivid: '#10B981' },
        down: { DEFAULT: '#E11D48', light: '#FB7185', vivid: '#F43F5E' },
      },
      boxShadow: {
        glass: '0 10px 36px -4px rgba(79, 70, 229, 0.10), 0 4px 16px -2px rgba(15, 23, 42, 0.06)',
        'glass-lg': '0 20px 48px -8px rgba(79, 70, 229, 0.18), 0 8px 24px -4px rgba(15, 23, 42, 0.12)',
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
