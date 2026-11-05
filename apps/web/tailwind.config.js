/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f6f7f9',
          100: '#edeef2',
          200: '#d7dbe2',
          300: '#b4bccb',
          400: '#8b97af',
          500: '#697593',
          600: '#535e7a',
          700: '#444d64',
          800: '#3a4154',
          900: '#1e232e',
          950: '#12151c',
        },
      },
    },
  },
  plugins: [],
};

