import { beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_SHARE_INVITE_KEY,
  clearPendingShareInvite,
  isShareInviteToken,
  readPendingShareInvite,
  shareInviteUrl,
  storePendingShareInvite,
} from "./shareInvite";

const TOKEN = "A".repeat(43);

describe("share invite handoff", () => {
  beforeEach(() => sessionStorage.clear());

  it("accepts only the server's base64url token shape", () => {
    expect(isShareInviteToken(TOKEN)).toBe(true);
    expect(isShareInviteToken("A".repeat(42))).toBe(false);
    expect(isShareInviteToken(`${"A".repeat(42)}+`)).toBe(false);
  });

  it("keeps a valid invite across same-tab authentication redirects", () => {
    expect(storePendingShareInvite(TOKEN)).toBe(true);
    expect(readPendingShareInvite()).toBe(TOKEN);
    expect(sessionStorage.getItem(PENDING_SHARE_INVITE_KEY)).toBe(TOKEN);

    clearPendingShareInvite();
    expect(readPendingShareInvite()).toBe(null);
  });

  it("removes malformed storage instead of retrying it", () => {
    sessionStorage.setItem(PENDING_SHARE_INVITE_KEY, "not-a-token");
    expect(readPendingShareInvite()).toBe(null);
    expect(sessionStorage.getItem(PENDING_SHARE_INVITE_KEY)).toBe(null);
  });

  it("builds a clean join URL without exposing the room id", () => {
    expect(shareInviteUrl(TOKEN, "https://duodoro.example")).toBe(
      `https://duodoro.example/join/${TOKEN}`,
    );
  });
});
