"use client";
import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

// Theme is applied to <html data-theme> by an inline script before paint
// (see layout.tsx). This hook subscribes to that attribute so every
// ThemeToggle instance stays in sync, and toggles persist to localStorage.

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = useCallback(() => {
    const next: Theme = getSnapshot() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("duodoro-theme", next);
    } catch {
      // localStorage unavailable (private mode) — theme still applies for this session
    }
  }, []);

  return { theme, toggleTheme };
}
