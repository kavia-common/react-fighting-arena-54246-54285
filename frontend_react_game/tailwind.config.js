/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ocean: {
          primary: "#2563EB",
          secondary: "#F59E0B",
          error: "#EF4444",
          surface: "#ffffff",
          bg: "#f9fafb",
          text: "#111827",
        },
      },
      boxShadow: {
        soft: "0 8px 24px rgba(2, 6, 23, 0.06)",
      },
    },
  },
  plugins: [],
};
