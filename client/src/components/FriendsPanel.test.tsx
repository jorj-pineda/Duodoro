import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/types";
import { expectNoAxeViolations } from "@/test/axe";

const retry = vi.fn();
let listState: Record<string, unknown>;

vi.mock("@/hooks/useFriendsList", () => ({
  useFriendsList: () => listState,
}));

vi.mock("@/hooks/useFriendSearch", () => ({
  useFriendSearch: () => ({
    searchQuery: "",
    setSearchQuery: vi.fn(),
    searchResults: [],
    loading: false,
    handleSearch: vi.fn(),
    sentRequests: new Set(),
    sendRequest: vi.fn(),
    error: null,
    clearError: vi.fn(),
  }),
}));

const onlineFriendIds = new Set<string>();
vi.mock("@/hooks/useOnlineFriends", () => ({
  useOnlineFriends: () => ({
    friends: [],
    onlineFriendIds,
    error: null,
    retry: vi.fn(),
  }),
}));

import FriendsPanel from "./FriendsPanel";

const profile: Profile = {
  id: "me",
  username: "jorge",
  discriminator: "0001",
  username_changed: false,
  display_name: "Jorge",
  display_name_changed_at: null,
  avatar_config: null,
  is_premium: false,
  current_room: null,
  current_session_id: null,
  current_world_id: null,
  updated_at: "2026-08-27T00:00:00Z",
};

function renderPanel() {
  return render(
    <FriendsPanel
      open
      onClose={vi.fn()}
      myProfile={profile}
      socketRef={{ current: null }}
      onJoinSession={vi.fn()}
      onInviteFriend={vi.fn()}
    />,
  );
}

describe("FriendsPanel load states", () => {
  beforeEach(() => {
    retry.mockClear();
    onlineFriendIds.clear();
    listState = {
      friends: [],
      requests: [],
      acceptRequest: vi.fn(),
      declineRequest: vi.fn(),
      loading: false,
      loaded: true,
      loadError: null,
      retry,
      error: null,
      clearError: vi.fn(),
    };
  });

  it("shows the empty state only after a successful load", () => {
    renderPanel();
    expect(screen.getByText(/No friends yet\./)).toBeInTheDocument();
  });

  it("exposes a labelled modal without semantic axe violations", async () => {
    const { container } = renderPanel();
    expect(screen.getByRole("dialog", { name: "Friends" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("moves between tabs with arrow keys", () => {
    renderPanel();
    const friendsTab = screen.getByRole("tab", { name: "friends" });
    friendsTab.focus();
    fireEvent.keyDown(friendsTab, { key: "ArrowRight" });

    expect(screen.getByRole("tab", { name: "requests" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "requests" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows an unavailable state and retry after a failed load", () => {
    listState.loaded = false;
    listState.loadError = "Couldn't load your friends. Check your connection.";
    renderPanel();

    expect(screen.queryByText(/No friends yet\./)).not.toBeInTheDocument();
    expect(
      screen.getByText("Friends are unavailable right now."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("marks a logged-in friend as online even when they are not in a session", () => {
    onlineFriendIds.add("friend-1");
    listState.friends = [
      {
        ...profile,
        id: "friend-1",
        display_name: "Michelle",
        username: "michelle",
      },
    ];
    renderPanel();
    expect(screen.getByTitle("Online")).toBeInTheDocument();
    expect(screen.queryByTitle("Offline")).not.toBeInTheDocument();
  });

  it("marks a friend in a live session even if the socket presence set is empty", () => {
    listState.friends = [
      {
        ...profile,
        id: "friend-1",
        display_name: "Michelle",
        username: "michelle",
        current_session_id: "sess-1",
        current_world_id: "forest",
      },
    ];
    renderPanel();
    expect(screen.getByTitle("In session")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
  });
});
