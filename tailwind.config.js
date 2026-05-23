/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sage: {
          50: '#F2F0EB',
          100: '#E8E5DF',
          200: '#D4CFC5',
          300: '#B8B2A8',
          400: '#8A9182',
          500: '#6B7265',
          600: '#5C6B4A',
          700: '#4A5C38',
          800: '#252B21',
          900: '#1A1F18',
        },
      },
      fontFamily: {
        grotesque: ['DarkerGrotesque_400Regular'],
        'grotesque-medium': ['DarkerGrotesque_500Medium'],
        'grotesque-semi': ['DarkerGrotesque_600SemiBold'],
        'grotesque-bold': ['DarkerGrotesque_700Bold'],
        jakarta: ['PlusJakartaSans_200ExtraLight'],
        'jakarta-regular': ['PlusJakartaSans_400Regular'],
        'jakarta-semi': ['PlusJakartaSans_600SemiBold'],
      },
      letterSpacing: {
        display: '0.025em',
      },
    },
  },
  plugins: [],
};
