import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/frontend/**/*.{ts,tsx}",
    "./src/backend/**/*.{ts,tsx}",
    "./src/shared/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "var(--font-display)",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "Times",
          "serif",
        ],
      },
      colors: {
        /** Dark mode surfaces (with `class` strategy + `html.dark`) */
        dm: {
          page: "#0f0f0f",
          elevated: "#111111",
          card: "#1a1a1a",
        },
        ink: "#101828",
        paper: "#F8FAFC",
        sand: "#E7EBF3",
        brand: {
          50: "#EEF2FF",
          100: "#E0E7FF",
          500: "#4F46E5",
          600: "#4338CA",
          700: "#3730A3",
        },
        accent: {
          500: "#0EA5E9",
          600: "#0284C7",
        },
      },
      boxShadow: {
        soft: "0 20px 60px rgba(15, 23, 42, 0.10)",
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(circle at top left, rgba(79, 70, 229, 0.18), transparent 32%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.16), transparent 28%), linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
