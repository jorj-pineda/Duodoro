import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import WorldNowCard from "./WorldNowCard";
import { worldAt, nextRotationAt, ROTATION_MS } from "@/lib/rotation";
import { getWorld } from "@/lib/avatarData";

// The card is a readout of the server's rotation, so what it has to get right
// is agreement with the clock — including *after* a boundary passes with the
// page still open.

const label = (t: number) => getWorld(worldAt(t)).label;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WorldNowCard", () => {
  it("names the world the rotation is on", () => {
    const now = Date.parse("2026-08-12T09:07:30Z");
    vi.setSystemTime(now);
    render(<WorldNowCard />);
    act(() => void vi.advanceTimersByTime(0));
    expect(screen.getByText(label(now))).toBeInTheDocument();
  });

  it("counts down to the changeover", () => {
    const now = Date.parse("2026-08-12T09:07:30Z");
    vi.setSystemTime(now);
    render(<WorldNowCard />);
    act(() => void vi.advanceTimersByTime(0));
    // 09:07:30 -> 09:30:00 is 22:30.
    expect(screen.getByText("22:30")).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(90_000));
    expect(screen.getByText("21:00")).toBeInTheDocument();
  });

  it("changes world when the boundary passes with the page open", () => {
    // A tab left open across a rotation must not keep advertising the old
    // world; someone reading it would press Focus and land somewhere else.
    const now = Date.parse("2026-08-12T09:07:30Z");
    vi.setSystemTime(now);
    render(<WorldNowCard />);
    act(() => void vi.advanceTimersByTime(0));
    const before = label(now);
    expect(screen.getByText(before)).toBeInTheDocument();

    const after = nextRotationAt(now) + 1000;
    act(() => {
      vi.setSystemTime(after);
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(before)).not.toBeInTheDocument();
    expect(screen.getByText(label(after))).toBeInTheDocument();
  });

  it("re-reads the clock rather than decrementing", () => {
    // Background tabs get their intervals throttled. Counting down from a
    // stored value drifts by however long the tab was asleep; re-reading
    // recovers on the next tick. Simulated here by moving the clock further
    // than the timers.
    const now = Date.parse("2026-08-12T09:00:00Z");
    vi.setSystemTime(now);
    render(<WorldNowCard />);
    act(() => void vi.advanceTimersByTime(0));

    act(() => {
      // The wall clock moves ten minutes; the timer queue only advances by one
      // tick, which is what a throttled background tab looks like.
      vi.setSystemTime(now + 10 * 60_000 - 1000);
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("20:00")).toBeInTheDocument();
  });

  it("shows one world, not a gallery of them", () => {
    // Guard on the premise: the picker is gone because there is nothing to
    // pick. A second world on this screen would put the choice back.
    vi.setSystemTime(Date.parse("2026-08-12T09:00:00Z"));
    const { container } = render(<WorldNowCard />);
    act(() => void vi.advanceTimersByTime(0));
    expect(container.querySelectorAll("svg").length).toBe(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("puts nothing time-derived in the server-rendered markup", () => {
    // Next renders this on the server, where "now" is a different number than
    // it is at hydration. Anything clock-derived in the first pass is a
    // guaranteed mismatch, which is why the hook starts at null and fills in
    // from an effect. renderToStaticMarkup is that first pass exactly —
    // testing-library's render() already flushes effects, so it cannot show
    // this.
    vi.setSystemTime(Date.parse("2026-08-12T09:00:00Z"));
    const markup = renderToStaticMarkup(<WorldNowCard />);
    expect(markup).not.toMatch(/Changes in/);
    expect(markup).not.toMatch(/\d\d:\d\d/);
  });

  it("agrees with the schedule for a full cycle", () => {
    const start = Date.parse("2026-08-12T00:30:00Z");
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const t = start + i * ROTATION_MS;
      vi.setSystemTime(t);
      const { unmount } = render(<WorldNowCard />);
      act(() => void vi.advanceTimersByTime(0));
      seen.push(screen.getByText(label(t)).textContent!);
      unmount();
    }
    expect(new Set(seen).size).toBe(8);
  });
});
