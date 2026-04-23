/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#020617',
          900: '#0B0E14',
          800: '#1A1D23',
          700: '#2D323A',
        },
        primary: {
          500: '#6366f1',
          600: '#4f46e5',
        },
        success: '#10b981',
        danger: '#ef4444',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
