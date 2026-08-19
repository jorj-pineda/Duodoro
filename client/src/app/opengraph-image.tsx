import { ImageResponse } from "next/og";
import { DARK_BG, DARK_INK, DARK_MUTED, PAPER, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Shared-link card. Two circles is the same duo mark as the app icon —
 * two people, not the Next.js emerald placeholder those circles used to sit on.
 *
 * Satori wants `display: flex` on every box; it has no CSS variables, so the
 * colours are the copies in `lib/site.ts`.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: DARK_BG,
        }}
      >
        <div style={{ display: "flex", gap: 40, marginBottom: 56 }}>
          <div
            style={{
              width: 128,
              height: 128,
              borderRadius: 64,
              backgroundColor: PAPER,
            }}
          />
          <div
            style={{
              width: 128,
              height: 128,
              borderRadius: 64,
              backgroundColor: PAPER,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: DARK_INK,
            letterSpacing: -1,
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: DARK_MUTED,
            marginTop: 16,
          }}
        >
          {SITE_TAGLINE}
        </div>
      </div>
    ),
    size,
  );
}
