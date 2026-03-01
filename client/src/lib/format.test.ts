import { describe, it, expect } from "vitest";
import { formatDuration, formatTime } from "./format";

describe("formatDuration", () => {
  it("formats minutes only", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(300)).toBe("5m");
    expect(formatDuration(1500)).toBe("25m");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(3600)).toBe("1h 0m");
    expect(formatDuration(3660)).toBe("1h 1m");
    expect(formatDuration(7200)).toBe("2h 0m");
    expect(formatDuration(5400)).toBe("1h 30m");
  });

  it("handles partial minutes", () => {
    expect(formatDuration(90)).toBe("1m");
    expect(formatDuration(119)).toBe("1m");
    expect(formatDuration(3601)).toBe("1h 0m");
  });
});

describe("formatTime", () => {
  it("formats seconds as MM:SS", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(60)).toBe("1:00");
    expect(formatTime(90)).toBe("1:30");
    expect(formatTime(1500)).toBe("25:00");
  });

  it("clamps negative values to 0:00", () => {
    expect(formatTime(-1)).toBe("0:00");
    expect(formatTime(-100)).toBe("0:00");
  });

  it("handles fractional seconds", () => {
    expect(formatTime(1.7)).toBe("0:01");
    expect(formatTime(59.9)).toBe("0:59");
  });
});
