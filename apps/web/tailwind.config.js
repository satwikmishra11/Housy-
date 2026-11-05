/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#FBFAF8',
        surface: '#FFFFFF',
        ink: '#16181D',
        muted: '#6B6F76',
        hairline: '#E7E4DE',
        accent: {
          DEFAULT: '#1F4D45',
          soft: '#E8EFEC',
          hover: '#193E37',
        },
        success: {
          DEFAULT: '#2F6B4F',
          soft: '#EAF3EE',
        },
        warning: {
          DEFAULT: '#A8741A',
          soft: '#F8F2E6',
        },
        danger: {
          DEFAULT: '#A33A3A',
          soft: '#F7EBEB',
        },
      },
      fontFamily: {
        serif: [
          'Cormorant Garamond',
          'Noto Sans Devanagari',
          'Noto Sans Gujarati',
          'Georgia',
          'serif',
        ],
        sans: [
          'Inter',
          'Noto Sans Devanagari',
          'Noto Sans Gujarati',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      borderRadius: {
        DEFAULT: '12px',
        xl: '12px',
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(22, 24, 29, 0.04)',
        card: '0 1px 3px 0 rgba(22, 24, 29, 0.05), 0 1px 2px -1px rgba(22, 24, 29, 0.04)',
        sheet: '0 4px 20px -2px rgba(22, 24, 29, 0.08)',
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
};
