"use client";
import { useEffect, useState } from "react";
import type { AvatarConfig, HairStyle, EyeStyle } from "@/lib/avatarData";

// ─────────────────────────────────────────────────────────────────────────────
// PixelCharacter — SVG-based 8-bit character renderer
//
// ViewBox: 0 0 16 24  (16 × 24 "pixels")
// Displayed at: size * 16 × size * 24  (default size=4 → 64×96px)
//
// Layout:
//   y=0–3   Hair top
//   y=3–10  Head / face  (skin)
//   y=6–7   Eyes
//   y=9     Blush marks
//   y=11    Neck
//   y=12–17 Body/outfit + Arms
//   y=18–22 Legs
//   y=23    Feet
// ─────────────────────────────────────────────────────────────────────────────

export type AnimState = "idle" | "walk" | "jump" | "sit" | "float";

interface PixelCharacterProps extends AvatarConfig {
  anim?: AnimState;
  facing?: "right" | "left";
  size?: number;
  className?: string;
}

// Darken a hex color by a ratio (0 = same, 1 = black)
function darken(hex: string, ratio = 0.25): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) * (1 - ratio)) | 0;
  const g = Math.max(0, ((n >> 8) & 0xff) * (1 - ratio)) | 0;
  const b = Math.max(0, (n & 0xff) * (1 - ratio)) | 0;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ── Hair Layers ───────────────────────────────────────────────────────────

function HairBack({ style, color }: { style: HairStyle; color: string }) {
  if (style === "long") {
    // Side drapes behind the body
    return (
      <>
        <rect x={1} y={4} width={2} height={9} fill={color} />
        <rect x={13} y={4} width={2} height={9} fill={color} />
      </>
    );
  }
  return null;
}

function HairFront({ style, color }: { style: HairStyle; color: string }) {
  const dark = darken(color, 0.15);
  switch (style) {
    case "bob":
      return (
        <>
          <rect x={3} y={0} width={10} height={4} fill={color} />
          <rect x={2} y={2} width={1} height={3} fill={color} />
          <rect x={13} y={2} width={1} height={3} fill={color} />
          {/* subtle shading line */}
          <rect x={3} y={3} width={10} height={1} fill={dark} />
        </>
      );
    case "mohawk":
      return (
        <>
          <rect x={7} y={0} width={2} height={6} fill={color} />
          <rect x={6} y={2} width={4} height={2} fill={color} />
          <rect x={5} y={3} width={6} height={1} fill={dark} />
        </>
      );
    case "long":
      return (
        <>
          <rect x={3} y={0} width={10} height={4} fill={color} />
          <rect x={2} y={2} width={1} height={3} fill={color} />
          <rect x={13} y={2} width={1} height={3} fill={color} />
          <rect x={3} y={3} width={10} height={1} fill={dark} />
        </>
      );
    case "spiky":
      return (
        <>
          {/* Base */}
          <rect x={4} y={2} width={8} height={2} fill={color} />
          {/* Spikes */}
          <rect x={4} y={0} width={2} height={3} fill={color} />
          <rect x={7} y={0} width={2} height={4} fill={color} />
          <rect x={10} y={0} width={2} height={3} fill={color} />
          <rect x={4} y={0} width={2} height={1} fill={dark} />
          <rect x={7} y={0} width={2} height={1} fill={dark} />
          <rect x={10} y={0} width={2} height={1} fill={dark} />
        </>
      );
    case "bald":
    default:
      return null;
  }
}

// ── Eye Layers ─────────────────────────────────────────────────────────────

function Eyes({ style }: { style: EyeStyle }) {
  switch (style) {
    case "anime":
      return (
        <>
          {/* Left eye */}
          <rect x={4} y={5} width={3} height={3} fill="#1a1a2e" />
          <rect x={4} y={5} width={1} height={1} fill="white" />
          {/* Right eye */}
          <rect x={9} y={5} width={3} height={3} fill="#1a1a2e" />
          <rect x={9} y={5} width={1} height={1} fill="white" />
        </>
      );
    case "sleepy":
      return (
        <>
          {/* Left eye — half-closed */}
          <rect x={4} y={7} width={3} height={1} fill="#1a1a2e" />
          <rect x={4} y={6} width={3} height={1} fill="#1a1a2e" opacity={0.4} />
          {/* Right eye */}
          <rect x={9} y={7} width={3} height={1} fill="#1a1a2e" />
          <rect x={9} y={6} width={3} height={1} fill="#1a1a2e" opacity={0.4} />
        </>
      );
    case "normal":
    default:
      return (
        <>
          {/* Left eye */}
          <rect x={4} y={6} width={2} height={2} fill="#1a1a2e" />
          <rect x={4} y={6} width={1} height={1} fill="white" />
          {/* Right eye */}
          <rect x={10} y={6} width={2} height={2} fill="#1a1a2e" />
          <rect x={10} y={6} width={1} height={1} fill="white" />
        </>
      );
  }
}

// ── Walk Frame Leg Positions ───────────────────────────────────────────────
// Returns { leftLegY, rightLegY, leftFootY, rightFootY }
function getWalkLegPos(frame: number) {
  switch (frame % 4) {
    case 0: return { leftLegY: 17, rightLegY: 19, leftFootY: 22, rightFootY: 23 };
    case 1: return { leftLegY: 18, rightLegY: 18, leftFootY: 23, rightFootY: 23 };
    case 2: return { leftLegY: 19, rightLegY: 17, leftFootY: 23, rightFootY: 22 };
    case 3: return { leftLegY: 18, rightLegY: 18, leftFootY: 23, rightFootY: 23 };
    default: return { leftLegY: 18, rightLegY: 18, leftFootY: 23, rightFootY: 23 };
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function PixelCharacter({
  skinColor,
  hairStyle,
  hairColor,
  eyeStyle,
  outfitColor,
  anim = "idle",
  facing = "right",
  size = 4,
  className,
}: PixelCharacterProps) {
  const [walkFrame, setWalkFrame] = useState(0);

  useEffect(() => {
    if (anim !== "walk") {
      setWalkFrame(0);
      return;
    }
    const id = setInterval(() => setWalkFrame((f) => (f + 1) % 4), 180);
    return () => clearInterval(id);
  }, [anim]);

  const pantsColor = darken(outfitColor, 0.3);
  const shoeColor = "#2a2a2a";
  const blushColor = "#F4A0A0";

  const w = 16 * size;
  const h = 24 * size;

  // Determine animation class
  let animClass = "";
  if (anim === "idle") animClass = "pixel-idle";
  if (anim === "jump") animClass = "pixel-jump";
  if (anim === "float") animClass = "pixel-float";
  if (anim === "sit") animClass = "pixel-idle"; // gentle idle while sitting

  const legPos = anim === "walk" ? getWalkLegPos(walkFrame) : { leftLegY: 18, rightLegY: 18, leftFootY: 23, rightFootY: 23 };

  // Sit pose offsets — legs come forward, arms go down
  const isSitting = anim === "sit";

  return (
    <svg
      viewBox="0 0 16 24"
      width={w}
      height={h}
      className={`${animClass} ${className ?? ""}`}
      style={{
        shapeRendering: "crispEdges",
        imageRendering: "pixelated",
        transform: facing === "left" ? "scaleX(-1)" : undefined,
        display: "block",
      }}
    >
      {/* ── HAIR BACK (behind body for long hair) ── */}
      <HairBack style={hairStyle} color={hairColor} />

      {/* ── ARMS (sleeve cap + forearm) ── */}
      {isSitting ? (
        // Sitting: arms resting at sides
        <>
          {/* Left sleeve cap */}
          <rect x={1} y={14} width={3} height={2} fill={outfitColor} />
          {/* Left forearm (skin) */}
          <rect x={1} y={16} width={3} height={2} fill={skinColor} />
          {/* Right sleeve cap */}
          <rect x={12} y={14} width={3} height={2} fill={outfitColor} />
          {/* Right forearm (skin) */}
          <rect x={12} y={16} width={3} height={2} fill={skinColor} />
        </>
      ) : (
        <>
          {/* Left arm */}
          <g transform={anim === "walk" && walkFrame % 4 < 2 ? "translate(0,1)" : ""}>
            <rect x={1} y={12} width={3} height={2} fill={outfitColor} />
            <rect x={1} y={14} width={3} height={3} fill={skinColor} />
          </g>
          {/* Right arm */}
          <g transform={anim === "walk" && walkFrame % 4 >= 2 ? "translate(0,1)" : ""}>
            <rect x={12} y={12} width={3} height={2} fill={outfitColor} />
            <rect x={12} y={14} width={3} height={3} fill={skinColor} />
          </g>
        </>
      )}

      {/* ── BODY/OUTFIT ── */}
      <rect x={4} y={12} width={8} height={6} fill={outfitColor} />
      {/* Collar detail */}
      <rect x={6} y={12} width={4} height={1} fill={darken(outfitColor, 0.15)} />

      {/* ── LEGS ── */}
      {isSitting ? (
        // Sitting legs: folded forward
        <>
          <rect x={3} y={20} width={4} height={3} fill={pantsColor} />
          <rect x={9} y={20} width={4} height={3} fill={pantsColor} />
          {/* Sitting feet */}
          <rect x={3} y={23} width={4} height={1} fill={shoeColor} />
          <rect x={9} y={23} width={4} height={1} fill={shoeColor} />
        </>
      ) : (
        <>
          <rect x={4} y={legPos.leftLegY} width={3} height={5} fill={pantsColor} />
          <rect x={9} y={legPos.rightLegY} width={3} height={5} fill={pantsColor} />
          {/* Feet */}
          <rect x={3} y={legPos.leftFootY} width={4} height={1} fill={shoeColor} />
          <rect x={9} y={legPos.rightFootY} width={4} height={1} fill={shoeColor} />
        </>
      )}

      {/* ── NECK ── */}
      <rect x={6} y={11} width={4} height={1} fill={skinColor} />

      {/* ── HEAD/FACE ── */}
      <rect x={3} y={3} width={10} height={8} fill={skinColor} />
      {/* Subtle shading on chin */}
      <rect x={3} y={10} width={10} height={1} fill={darken(skinColor, 0.08)} />

      {/* ── EYES ── */}
      <Eyes style={eyeStyle} />

      {/* ── BLUSH ── */}
      <rect x={3} y={8} width={2} height={1} fill={blushColor} opacity={0.6} />
      <rect x={11} y={8} width={2} height={1} fill={blushColor} opacity={0.6} />

      {/* ── HAIR FRONT ── */}
      <HairFront style={hairStyle} color={hairColor} />
    </svg>
  );
}
