import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FriendsOnlineSection from "./FriendsOnlineSection";

describe("FriendsOnlineSection load failure", () => {
  it("renders a retryable error instead of disappearing like an empty list", () => {
    const retry = vi.fn();
    render(
      <FriendsOnlineSection
        onlineFriends={[]}
        error="Couldn't load friend presence."
        retry={retry}
        onOpenFriends={vi.fn()}
        onJoinSession={vi.fn()}
        onInvite={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Friend presence is unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
