"use client";
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

// Theme is applied to <html data-theme> by an inline script before paint
// (see layout.tsx); this hook just mirrors it into React state and toggles.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("duodoro-theme", next);
      } catch {
        // localStorage unavailable (private mode) — theme still applies for this session
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
