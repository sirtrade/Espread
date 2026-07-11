/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        bg: "var(--tg-bg)",
        surface: "var(--tg-surface)",
        text: "var(--tg-text)",
        subtext: "var(--tg-subtext)",
        accent: "var(--tg-accent)",
        amber: "var(--tg-amber)",
        teal: "var(--tg-teal)",
      },
      fontFamily: {
        serif: ["Georgia", "'Iowan Old Style'", "'Palatino Linotype'", "serif"],
      },
    },
  },
  plugins: [],
};
