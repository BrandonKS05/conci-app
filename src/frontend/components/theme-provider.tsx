"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ConciTheme = "light" | "dark";

type ThemeContextValue = {
  /** `null` until client has read `localStorage` */
  theme: ConciTheme | null;
  resolvedTheme: ConciTheme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ConciTheme | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("conci-theme");
    const initial: ConciTheme = stored === "dark" || stored === "light" ? stored : "dark";
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (theme === null) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("conci-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => ((current ?? "dark") === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: theme ?? "dark",
      toggleTheme,
    }),
    [theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useConciTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useConciTheme must be used within ThemeProvider");
  }
  return ctx;
}

const shellToggleClass =
  "shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:border-white/15 dark:hover:bg-dm-elevated";

const landingToggleClass =
  "rounded-full border border-gray-300 bg-white/90 px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:bg-dm-elevated sm:text-sm";

export function ThemeToggleButton({
  className = "",
  variant = "shell",
}: {
  className?: string;
  variant?: "shell" | "landing";
}) {
  const { resolvedTheme, toggleTheme } = useConciTheme();
  const base = variant === "landing" ? landingToggleClass : shellToggleClass;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${base} ${className}`.trim()}
      aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
