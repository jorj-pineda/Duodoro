"use client";
import { createContext, useContext } from "react";
import { ART_PX } from "@/lib/scene";

// ─────────────────────────────────────────────────────────────────────────────
// The scene's art pixel, as context.
//
// `ART_PX` is still the number; what changes on a small screen is *which* of
// the two stops the scene is drawn at, and every sprite in one frame has to
// agree on that or the scene has two pixel grids in it — the exact failure
// ART_PX was introduced to end. Context is what makes agreement the default:
// there is one provider per scene, so a sprite cannot pick its own answer
// without being handed one.
//
// **Passing it down as a prop was the alternative and it is worse here.** The
// scenery is ~20 components deep in places (`ForestDecor` → `Grounded` →
// `ContactShadow`), and a prop that must reach all of them is a prop that will
// eventually be forgotten on one — which is a mismatch nobody sees until it is
// in front of a user.
//
// The default is the desktop size, so anything rendered outside a scene draws
// the way it always has: `AvatarCreator`'s preview, and every unit test that
// mounts a sprite on its own.
// ─────────────────────────────────────────────────────────────────────────────

const ArtPxContext = createContext<number>(ART_PX);

/**
 * One art pixel in CSS px for the scene this component is inside.
 *
 * Outside a `ScenePixel`, this is `ART_PX` — the desktop size.
 */
export function useArtPx(): number {
  return useContext(ArtPxContext);
}

/** Wraps a scene, fixing the art pixel for everything drawn inside it. */
export default function ScenePixel({
  value,
  children,
}: {
  value: number;
  children: React.ReactNode;
}) {
  return (
    <ArtPxContext.Provider value={value}>{children}</ArtPxContext.Provider>
  );
}
