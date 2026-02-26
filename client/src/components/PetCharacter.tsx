"use client";
import { useEffect, useState } from "react";
import type { AnimState } from "./PixelCharacter";
import type { PetType } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// PetCharacter — tiny SVG pixel art pets (10×10 viewBox)
// All pets match their owner's animation state.
// ─────────────────────────────────────────────────────────────────────────────

interface PetCharacterProps {
  type: PetType;
  anim?: AnimState;
  facing?: "right" | "left";
  size?: number;
}

// Cat pixel art (10×10)
function CatPixels({ legUp }: { legUp: boolean }) {
  return (
    <>
      {/* Ears */}
      <rect x={1} y={0} width={2} height={2} fill="#d4a373" />
      <rect x={7} y={0} width={2} height={2} fill="#d4a373" />
      <rect x={2} y={0} width={1} height={1} fill="#f4a261" />
      <rect x={7} y={0} width={1} height={1} fill="#f4a261" />
      {/* Head */}
      <rect x={1} y={2} width={8} height={5} fill="#e9c46a" />
      {/* Eyes */}
      <rect x={2} y={3} width={2} height={2} fill="#2d6a4f" />
      <rect x={6} y={3} width={2} height={2} fill="#2d6a4f" />
      <rect x={2} y={3} width={1} height={1} fill="white" />
      <rect x={6} y={3} width={1} height={1} fill="white" />
      {/* Nose */}
      <rect x={4} y={5} width={2} height={1} fill="#e76f51" />
      {/* Body */}
      <rect x={2} y={7} width={6} height={3} fill="#e9c46a" />
      {/* Tail */}
      <rect x={8} y={6} width={2} height={1} fill="#d4a373" />
      <rect x={9} y={5} width={1} height={2} fill="#d4a373" />
      {/* Legs */}
      <rect x={2} y={legUp ? 9 : 10} width={2} height={1} fill="#d4a373" />
      <rect x={6} y={legUp ? 10 : 9} width={2} height={1} fill="#d4a373" />
    </>
  );
}

// Dog pixel art (10×10)
function DogPixels({ legUp }: { legUp: boolean }) {
  return (
    <>
      {/* Ears (floppy) */}
      <rect x={0} y={2} width={2} height={3} fill="#c9a46e" />
      <rect x={8} y={2} width={2} height={3} fill="#c9a46e" />
      {/* Head */}
      <rect x={1} y={1} width={8} height={5} fill="#e8c99a" />
      {/* Snout */}
      <rect x={3} y={4} width={4} height={2} fill="#d4a373" />
      {/* Eyes */}
      <rect x={2} y={2} width={2} height={2} fill="#4a2800" />
      <rect x={6} y={2} width={2} height={2} fill="#4a2800" />
      <rect x={2} y={2} width={1} height={1} fill="white" />
      <rect x={6} y={2} width={1} height={1} fill="white" />
      {/* Nose */}
      <rect x={4} y={4} width={2} height={1} fill="#2a1800" />
      {/* Body */}
      <rect x={2} y={6} width={6} height={3} fill="#e8c99a" />
      {/* Tail */}
      <rect x={8} y={5} width={1} height={2} fill="#c9a46e" />
      <rect x={9} y={4} width={1} height={2} fill="#c9a46e" />
      {/* Legs */}
      <rect x={2} y={legUp ? 8 : 9} width={2} height={1} fill="#c9a46e" />
      <rect x={6} y={legUp ? 9 : 8} width={2} height={1} fill="#c9a46e" />
    </>
  );
}

// Dragon pixel art (10×10) — premium
function DragonPixels({ legUp }: { legUp: boolean }) {
  return (
    <>
      {/* Horns */}
      <rect x={3} y={0} width={1} height={2} fill="#7c3aed" />
      <rect x={6} y={0} width={1} height={2} fill="#7c3aed" />
      {/* Head */}
      <rect x={1} y={2} width={8} height={4} fill="#a78bfa" />
      {/* Snout */}
      <rect x={3} y={4} width={4} height={2} fill="#8b5cf6" />
      {/* Eyes */}
      <rect x={2} y={3} width={2} height={2} fill="#ffd700" />
      <rect x={6} y={3} width={2} height={2} fill="#ffd700" />
      <rect x={2} y={3} width={1} height={1} fill="white" />
      <rect x={6} y={3} width={1} height={1} fill="white" />
      {/* Wings */}
      <rect x={0} y={6} width={2} height={2} fill="#7c3aed" />
      <rect x={8} y={6} width={2} height={2} fill="#7c3aed" />
      {/* Body */}
      <rect x={2} y={6} width={6} height={3} fill="#a78bfa" />
      {/* Tail */}
      <rect x={8} y={8} width={2} height={1} fill="#7c3aed" />
      {/* Legs */}
      <rect x={2} y={legUp ? 8 : 9} width={2} height={1} fill="#8b5cf6" />
      <rect x={6} y={legUp ? 9 : 8} width={2} height={1} fill="#8b5cf6" />
    </>
  );
}

// Rabbit pixel art (10×10)
function RabbitPixels({ legUp }: { legUp: boolean }) {
  return (
    <>
      {/* Ears (tall) */}
      <rect x={2} y={0} width={2} height={4} fill="#f0e6d3" />
      <rect x={6} y={0} width={2} height={4} fill="#f0e6d3" />
      <rect x={3} y={0} width={1} height={3} fill="#f4a0a0" />
      <rect x={6} y={0} width={1} height={3} fill="#f4a0a0" />
      {/* Head */}
      <rect x={1} y={3} width={8} height={5} fill="#f0e6d3" />
      {/* Eyes */}
      <rect x={2} y={4} width={2} height={2} fill="#e91e8c" />
      <rect x={6} y={4} width={2} height={2} fill="#e91e8c" />
      <rect x={2} y={4} width={1} height={1} fill="white" />
      <rect x={6} y={4} width={1} height={1} fill="white" />
      {/* Nose */}
      <rect x={4} y={6} width={2} height={1} fill="#f4a0a0" />
      {/* Body */}
      <rect x={2} y={8} width={6} height={2} fill="#f0e6d3" />
      {/* Fluffy tail */}
      <rect x={8} y={8} width={2} height={2} fill="white" />
      {/* Legs */}
      <rect x={2} y={legUp ? 9 : 10} width={2} height={1} fill="#e0d0bc" />
      <rect x={6} y={legUp ? 10 : 9} width={2} height={1} fill="#e0d0bc" />
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PetCharacter({
  type,
  anim = "idle",
  facing = "right",
  size = 3,
}: PetCharacterProps) {
  const [walkFrame, setWalkFrame] = useState(0);

  useEffect(() => {
    if (anim !== "walk") {
      setWalkFrame(0);
      return;
    }
    const id = setInterval(() => setWalkFrame((f) => (f + 1) % 2), 250);
    return () => clearInterval(id);
  }, [anim]);

  let animClass = "";
  if (anim === "idle") animClass = "pixel-idle";
  if (anim === "jump") animClass = "pixel-jump";
  if (anim === "float") animClass = "pixel-float";

  const legUp = walkFrame === 0;

  const PetPixels = {
    cat: CatPixels,
    dog: DogPixels,
    dragon: DragonPixels,
    rabbit: RabbitPixels,
  }[type];

  return (
    <svg
      viewBox="0 0 10 10"
      width={10 * size}
      height={10 * size}
      className={animClass}
      style={{
        shapeRendering: "crispEdges",
        imageRendering: "pixelated",
        transform: facing === "left" ? "scaleX(-1)" : undefined,
        display: "block",
      }}
    >
      <PetPixels legUp={legUp} />
    </svg>
  );
}
