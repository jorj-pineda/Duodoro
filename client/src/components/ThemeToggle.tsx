"use client";
import { useTheme } from "@/hooks/useTheme";
import { SunIcon, MoonIcon } from "./Icons";

interface Props {
  className?: string;
  /** For use over dark game-world scenes regardless of theme */
  onScene?: boolean;
}

export default function ThemeToggle({ className, onScene }: Props) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleTheme();
      }}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
        onScene
          ? "text-white/70 hover:text-white hover:bg-white/10"
          : "text-muted hover:text-ink hover:bg-raise"
      } ${className ?? ""}`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
