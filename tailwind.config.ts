import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

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
        /** Light-mode surfaces (previously dark; remapped after dark mode removal). */
        dm: {
          page: "#ffffff",
          elevated: "#f8fafc",
          card: "#ffffff",
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
        /** shadcn semantic tokens (HSL CSS variables defined in globals.css). */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 20px 60px rgba(15, 23, 42, 0.10)",
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(circle at top left, rgba(79, 70, 229, 0.18), transparent 32%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.16), transparent 28%), linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
};

export default config;
