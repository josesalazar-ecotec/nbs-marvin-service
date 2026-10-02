/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        'ecotec-azul': '#1B3A6B',
        'ecotec-medio': '#2C5282',
        'ecotec-claro': '#E8EEF7',
        'ecotec-acento': '#2563EB',
      },
    },
  },
  plugins: [],
}
