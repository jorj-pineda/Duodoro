import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { setMuted } from "@/lib/sounds";
import { useSound } from "./useSound";

// There are two SoundToggles in the app — one in the home top bar, one in the
// session top bar. They must never disagree, which is the whole reason the flag
// lives in a module store behind useSyncExternalStore instead of useState.
describe("useSound", () => {
  // Wrapped in act because setMuted notifies subscribers, which re-renders any
  // still-mounted hook from this test.
  afterEach(() => act(() => setMuted(false)));

  it("starts audible", () => {
    const { result } = renderHook(() => useSound());
    expect(result.current.muted).toBe(false);
  });

  it("toggles", () => {
    const { result } = renderHook(() => useSound());
    act(() => result.current.toggleMuted());
    expect(result.current.muted).toBe(true);
    act(() => result.current.toggleMuted());
    expect(result.current.muted).toBe(false);
  });

  it("keeps every mounted instance in sync", () => {
    const a = renderHook(() => useSound());
    const b = renderHook(() => useSound());

    act(() => a.result.current.toggleMuted());

    expect(a.result.current.muted).toBe(true);
    expect(b.result.current.muted).toBe(true);
  });

  it("reflects a change made outside React, e.g. from a socket handler", () => {
    const { result } = renderHook(() => useSound());
    act(() => setMuted(true));
    expect(result.current.muted).toBe(true);
  });
});
