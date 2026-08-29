import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/test/axe";
import InvitePopup from "./InvitePopup";

const invite = {
  sessionId: "session-1",
  worldId: "forest" as const,
  fromName: "Alex",
  fromUserId: "user-2",
};

describe("InvitePopup accessibility", () => {
  it("is a labelled modal that dismisses with Escape", async () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <InvitePopup invite={invite} onAccept={vi.fn()} onDismiss={onDismiss} />,
    );

    expect(
      screen.getByRole("dialog", { name: /Alex invited you to focus/ }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });
});
