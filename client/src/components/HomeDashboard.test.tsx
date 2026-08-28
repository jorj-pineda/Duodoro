import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HomeDashboard from "./HomeDashboard";
import { WORLDS } from "@/lib/avatarData";
import { worldAt } from "@/lib/rotation";
import type { Profile } from "@/lib/types";

// Home used to open with an eight-thumbnail world picker and hand the choice
// to onFocus. With the rotation the choice doesn't exist: there is one world,
// the server picks it, and pressing Focus takes whatever is up.

vi.mock("@/lib/useStats", () => ({
  useStats: () => ({
    personalStats: null,
    duoStats: null,
    recentSessions: [],
    dailyFocus: [],
    loading: false,
    error: null,
    loaded: true,
    retry: vi.fn(),
    fetchStats: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: [],
    newTask: "",
    setNewTask: vi.fn(),
    addTask: vi.fn(),
    toggleTask: vi.fn(),
    deleteTask: vi.fn(),
    pendingTasks: [],
    completedTasks: [],
    clearCompleted: vi.fn(),
    error: null,
    clearError: vi.fn(),
  }),
}));

vi.mock("@/hooks/useOnlineFriends", () => ({
  useOnlineFriends: () => ({
    friends: [],
    onlineFriendIds: [],
    error: null,
    retry: vi.fn(),
  }),
}));

const profile: Profile = {
  id: "user-1",
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
  updated_at: "2026-08-12T00:00:00Z",
};

function renderHome(overrides: Partial<Parameters<typeof HomeDashboard>[0]> = {}) {
  const onFocus = overrides.onFocus ?? vi.fn();
  const onOpenPremium = overrides.onOpenPremium ?? vi.fn();
  const utils = render(
    <HomeDashboard
      profile={overrides.profile ?? profile}
      socketRef={{ current: null }}
      onFocus={onFocus}
      onOpenPremium={onOpenPremium}
      onRejoinSession={vi.fn()}
      onJoinSession={vi.fn()}
      onInvite={vi.fn()}
      onEditAvatar={vi.fn()}
      onChangeUsername={vi.fn()}
      onChangeDisplayName={vi.fn()}
      onSignOut={vi.fn()}
      onAccountDeleted={vi.fn()}
      onOpenFriends={vi.fn()}
      onOpenStats={vi.fn()}
    />,
  );
  return { ...utils, onFocus, onOpenPremium };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(Date.parse("2026-08-12T09:07:30Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HomeDashboard world rotation", () => {
  it("offers no world to choose", () => {
    renderHome();
    expect(screen.queryByText("Choose a world")).not.toBeInTheDocument();
    // Every world but the current one should be absent. Naming them
    // individually rather than counting buttons, so this still fails if the
    // picker comes back in a different shape.
    const current = worldAt(Date.now());
    for (const world of WORLDS) {
      if (world.id === current) continue;
      expect(screen.queryByText(world.label)).not.toBeInTheDocument();
    }
  });

  it("shows the world the rotation is on", () => {
    renderHome();
    const current = WORLDS.find((w) => w.id === worldAt(Date.now()))!;
    expect(screen.getByText("Everyone's world")).toBeInTheDocument();
    expect(screen.getByText(current.label)).toBeInTheDocument();
    expect(screen.getByText("22:30")).toBeInTheDocument();
  });

  it("starts a session without being told where", () => {
    const { onFocus } = renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Focus" }));
    expect(onFocus).toHaveBeenCalledTimes(1);
    // Previously this was onFocus(selectedWorld). Nothing may be passed now —
    // an argument here would mean the client still believes it decides.
    expect(onFocus).toHaveBeenCalledWith();
  });
});

describe("HomeDashboard premium entry point", () => {
  /** Open the avatar menu, where the upgrade button lives. */
  function openProfileMenu() {
    fireEvent.click(screen.getByRole("button", { name: "J" }));
  }

  it("opens the premium modal from the home screen", () => {
    // The bug: this button's entire onClick was setProfileMenuOpen(false).
    // It closed the menu and did nothing else, so the home screen — the
    // primary place anyone would look — silently dropped the request, while
    // the in-session button next to it worked.
    const { onOpenPremium } = renderHome();
    openProfileMenu();
    fireEvent.click(screen.getByRole("button", { name: /Unlock pets/ }));
    expect(onOpenPremium).toHaveBeenCalledTimes(1);
  });

  it("closes the menu on the way", () => {
    // Guard: the one thing the old handler did right.
    renderHome();
    openProfileMenu();
    expect(screen.getByText("Change display name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Unlock pets/ }));
    expect(screen.queryByText("Change display name")).not.toBeInTheDocument();
  });

  it("does not offer the unlock to someone who already has it", () => {
    renderHome({ profile: { ...profile, is_premium: true } });
    openProfileMenu();
    expect(screen.queryByText(/Unlock pets/)).not.toBeInTheDocument();
  });
});
