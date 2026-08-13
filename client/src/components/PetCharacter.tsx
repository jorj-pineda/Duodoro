"use client";
import { useEffect, useState } from "react";
import type { AnimState } from "./PixelCharacter";
import type { PetType } from "@/lib/types";
import { ART_PX } from "@/lib/scene";
import { PET_ART } from "@/lib/petMaps";
import PixelSprite from "./PixelSprite";

// ─────────────────────────────────────────────────────────────────────────────
// PetCharacter — the companion that walks with you.
//
// The art is in `lib/petMaps.ts`. `size` is one art pixel in CSS px, the same
// unit the character uses — pets used to render at 2 while the character
// rendered at 3, which is two pixel grids in one frame.
// ─────────────────────────────────────────────────────────────────────────────

interface PetCharacterProps {
  type: PetType;
  anim?: AnimState;
  facing?: "right" | "left";
  size?: number;
  outline?: string;
}

const STEP_MS = 250;

export default function PetCharacter({
  type,
  anim = "idle",
  facing = "right",
  size = ART_PX,
  outline,
}: PetCharacterProps) {
  const [walkFrame, setWalkFrame] = useState(0);

  useEffect(() => {
    // See PixelCharacter: resetting the frame in the effect body was a
    // synchronous setState, so the resting frame is derived instead.
    if (anim !== "walk") return;
    const id = setInterval(() => setWalkFrame((f) => (f + 1) % 2), STEP_MS);
    return () => clearInterval(id);
  }, [anim]);

  const frame = anim === "walk" ? walkFrame : 0;
  const art = PET_ART[type];

  let animClass = "";
  if (anim === "idle") animClass = "pixel-idle";
  if (anim === "jump") animClass = "pixel-jump";
  if (anim === "float") animClass = "pixel-float";

  return (
    <PixelSprite
      map={art.frames[frame]}
      palette={art.palette}
      scale={size}
      outline={outline}
      className={animClass}
      style={{ transform: facing === "left" ? "scaleX(-1)" : undefined }}
    />
  );
}
