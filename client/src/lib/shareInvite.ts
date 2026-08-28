export const PENDING_SHARE_INVITE_KEY = "duodoro:pending-share-invite";

export function isShareInviteToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function storePendingShareInvite(token: unknown): boolean {
  if (!isShareInviteToken(token) || typeof window === "undefined") return false;
  sessionStorage.setItem(PENDING_SHARE_INVITE_KEY, token);
  return true;
}

export function readPendingShareInvite(): string | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem(PENDING_SHARE_INVITE_KEY);
  if (isShareInviteToken(token)) return token;
  sessionStorage.removeItem(PENDING_SHARE_INVITE_KEY);
  return null;
}

export function clearPendingShareInvite() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(PENDING_SHARE_INVITE_KEY);
  }
}

export function shareInviteUrl(token: string, origin: string): string | null {
  if (!isShareInviteToken(token)) return null;
  return `${origin}/join/${encodeURIComponent(token)}`;
}
