/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000', // Pure black like Offsuit
        surface: '#1A1A1A', // Dark grey for cards/buttons
        surfaceLight: '#2A2A2A', // Lighter grey for hover/accents
        primary: '#FFFFFF', // White text
        accent: '#FF453A', // iOS Red for hearts/diamonds
        spades: '#FFFFFF', // White/Light Grey for spades/clubs on dark mode
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      }
    },
  },
  plugins: [],
}
