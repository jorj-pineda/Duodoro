"use client";
import type { ButtonHTMLAttributes } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Button — the app's one button language.
//
// Filled variants share the chunky "pressed pixel" look (border-b-4 in the
// deep shade of the same hue, font-display, presses down on :active).
// `surface` is the neutral secondary; `ghost` is for low-emphasis text
// actions. Anything not covered here (brand OAuth buttons, icon buttons)
// stays bespoke on purpose.
// ─────────────────────────────────────────────────────────────────────────────

type Variant = "accent" | "calm" | "gold" | "go" | "surface" | "ghost";
type Size = "sm" | "md" | "lg";

// Chunky press: bottom edge compresses and the button dips on :active
const PRESS = "active:border-b-2 active:translate-y-0.5";

const VARIANT_CLASSES: Record<Variant, string> = {
  accent: `bg-accent hover:brightness-105 text-white font-display tracking-wide shadow-lg border-b-4 border-accent-deep ${PRESS}`,
  calm: `bg-calm hover:brightness-105 text-white font-display tracking-wide shadow-lg border-b-4 border-calm-deep ${PRESS}`,
  gold: `bg-gold hover:brightness-105 text-white font-display tracking-wide shadow-lg border-b-4 border-gold-deep ${PRESS}`,
  go: `bg-go hover:brightness-105 text-white font-display tracking-wide shadow-lg border-b-4 border-go-deep ${PRESS}`,
  surface: `bg-surface hover:bg-raise text-ink font-semibold border border-line border-b-4 shadow-sm ${PRESS}`,
  ghost: "text-muted hover:text-ink font-semibold active:scale-[0.98]",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-4 py-2 text-sm rounded-xl",
  md: "px-6 py-3 text-base rounded-2xl",
  lg: "px-8 py-4 text-xl rounded-2xl",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

export default function Button({
  variant = "accent",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${
        fullWidth ? "w-full" : ""
      } transition-all disabled:opacity-60 disabled:pointer-events-none ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
