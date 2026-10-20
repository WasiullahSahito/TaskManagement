/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#25243a",
        muted: "#858497",
        canvas: "#f7f7fb",
        violet: "#7059e8",
        lavender: "#eeebff",
        mint: "#e5f6ef",
      },
      boxShadow: {
        card: "0 6px 24px rgba(35, 30, 80, 0.055)",
        pop: "0 22px 70px rgba(25, 20, 55, 0.22)",
      },
    },
  },
  plugins: [],
};
