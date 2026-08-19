import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import WorldThumb from "./WorldThumb";
import { WORLDS } from "@/lib/avatarData";

describe("WorldThumb", () => {
  it("renders a sprite for every world, and nothing for an unknown id", () => {
    for (const world of WORLDS) {
      const { container } = render(<WorldThumb worldId={world.id} />);
      expect(container.querySelector("svg"), world.id).toBeTruthy();
    }
    const { container } = render(<WorldThumb worldId="lofi" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
