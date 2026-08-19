import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PetPicker from "./PetPicker";
import { PET_OPTIONS } from "@/lib/types";

describe("PetPicker", () => {
  it("draws the pets instead of emoji, and a lock instead of 🔒", () => {
    // A/B — against the previous commit this contains 🐱🐶🐉🐰 and 🔒.
    const { container: locked } = render(
      <PetPicker
        selected={null}
        onSelect={vi.fn()}
        isPremium={false}
        onPremiumClick={vi.fn()}
      />,
    );
    expect(locked.textContent).not.toMatch(/🐱|🐶|🐉|🐰|🔒/);
    expect(locked.querySelectorAll("svg").length).toBe(PET_OPTIONS.length);

    const { container: open } = render(
      <PetPicker
        selected="cat"
        onSelect={vi.fn()}
        isPremium
        onPremiumClick={vi.fn()}
      />,
    );
    expect(open.textContent).not.toMatch(/🐱|🐶|🐉|🐰|🔒/);
    expect(screen.getByTitle("Cat")).toBeInTheDocument();
    // Grown pet sprites, one per option, plus nothing else using emoji.
    expect(open.querySelectorAll("svg").length).toBe(PET_OPTIONS.length);
  });
});
