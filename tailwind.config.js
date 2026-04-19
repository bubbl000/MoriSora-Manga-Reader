/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#CBE93A',
          hover: '#B5D033',
          text: '#1A1A1A',
        },
        bg: {
          main: '#1A1A1A',
          panel: '#212121',
          card: '#272727',
          hover: '#2E2E2E',
          input: '#2A2A2A',
        },
        border: {
          1: '#363636',
          2: '#444444',
        },
        text: {
          primary: '#E0E0E0',
          secondary: '#909090',
          muted: '#555555',
        },
        toolbar: {
          bg: 'transparent',
          text: '#A0A0A0',
          hover: {
            bg: '#2E2E2E',
            text: '#E0E0E0',
          },
          pressed: '#3A3A3A',
        },
        tag: {
          bg: '#252525',
          border: '#363636',
          text: '#A0A0A0',
          hover: {
            bg: '#2A3010',
            border: '#CBE93A',
            text: '#CBE93A',
          },
        },
      },
    },
  },
  plugins: [],
}
