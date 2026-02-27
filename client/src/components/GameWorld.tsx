"use client";
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PixelCharacter, { type AnimState } from "./PixelCharacter";
import PetCharacter from "./PetCharacter";
import { getWorld, type WorldId, type AvatarConfig } from "@/lib/avatarData";
import type { PetType } from "@/lib/types";

export type GamePhase =
  | "waiting"
  | "focus"
  | "celebration"
  | "break"
  | "returning";

interface PlayerInfo {
  id: string;
  avatar: AvatarConfig;
}

interface Props {
  worldId: WorldId;
  phase: GamePhase;
  /** 0–1: how far toward center the characters have walked */
  focusProgress: number;
  /** 0–1: how far through the returning animation (1 = back at start) */
  returningProgress: number;
  me: PlayerInfo;
  partner: PlayerInfo | null;
  myPet?: PetType | null;
  partnerPet?: PetType | null;
}

// ── World Decorations ──────────────────────────────────────────────────────

function ForestDecor() {
  return (
    <>
      {/* Clouds */}
      {[[8, 14], [35, 8], [62, 18], [80, 10]].map(([left, top], i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: `${left}%`, top: `${top}%` }}
        >
          <div className="flex gap-1 opacity-90">
            <div className="w-6 h-4 bg-white rounded-full" />
            <div className="w-8 h-5 bg-white rounded-full -ml-3 -mt-1" />
            <div className="w-5 h-4 bg-white rounded-full -ml-2" />
          </div>
        </div>
      ))}
      {/* Trees */}
      {[[5, 58], [12, 52], [82, 58], [90, 52]].map(([left, bottom], i) => (
        <div key={i} className="absolute" style={{ left: `${left}%`, bottom: `${bottom}%` }}>
          <PixelTree />
        </div>
      ))}
    </>
  );
}

function SpaceDecor() {
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        x: (i * 37 + 11) % 100,
        y: (i * 53 + 7) % 65,
        size: i % 3 === 0 ? 2 : 1,
      })),
    []
  );
  return (
    <>
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: 0.6 + (i % 4) * 0.1,
          }}
        />
      ))}
      {/* Planet */}
      <div
        className="absolute right-12 top-4 w-16 h-16 rounded-full opacity-70"
        style={{
          background: "radial-gradient(circle at 35% 35%, #c084fc, #4c1d95)",
          boxShadow: "0 0 20px #7c3aed55",
        }}
      />
      {/* Planet ring */}
      <div
        className="absolute right-6 top-10 w-28 h-6 border-2 border-purple-400 rounded-full opacity-40"
        style={{ transform: "rotateX(70deg)" }}
      />
    </>
  );
}

function BeachDecor() {
  return (
    <>
      {/* Sun */}
      <div
        className="absolute left-8 top-4 w-14 h-14 rounded-full"
        style={{
          background: "radial-gradient(circle, #FFF9C4, #FFD166)",
          boxShadow: "0 0 24px #FFD16688",
        }}
      />
      {/* Waves */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute"
          style={{
            bottom: `${42 + i * 3}%`,
            left: 0,
            right: 0,
            height: 8,
            background: "rgba(96, 165, 250, 0.4)",
            borderRadius: "50% 50% 0 0",
            transform: `scaleX(${1 + i * 0.1})`,
          }}
        />
      ))}
      {/* Palm tree (right side) */}
      <div className="absolute right-8 bottom-[40%]">
        <PalmTree />
      </div>
    </>
  );
}

function PixelTree() {
  return (
    <div className="flex flex-col items-center" style={{ imageRendering: "pixelated" }}>
      <div className="w-0 h-0" style={{ borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderBottom: "14px solid #2d6a4f" }} />
      <div className="w-0 h-0 -mt-2" style={{ borderLeft: "13px solid transparent", borderRight: "13px solid transparent", borderBottom: "16px solid #40916c" }} />
      <div className="w-0 h-0 -mt-2" style={{ borderLeft: "16px solid transparent", borderRight: "16px solid transparent", borderBottom: "18px solid #52b788" }} />
      <div className="w-3 h-8" style={{ backgroundColor: "#6b4f2a" }} />
    </div>
  );
}

function PalmTree() {
  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-1 mb-1">
        <div className="w-6 h-2 rounded-full bg-green-600 -rotate-45 origin-right" />
        <div className="w-6 h-2 rounded-full bg-green-500 rotate-45 origin-left" />
      </div>
      <div className="w-2 h-14 rounded-b-sm" style={{ background: "linear-gradient(180deg, #a16207, #78350f)", transform: "rotate(5deg)" }} />
    </div>
  );
}

// ── Character Positioning ──────────────────────────────────────────────────

function getCharacterAnim(phase: GamePhase, isMe: boolean): AnimState {
  switch (phase) {
    case "waiting": return "idle";
    case "focus": return "walk";
    case "celebration": return "jump";
    case "break": return "sit";
    case "returning": return "float";
    default: return "idle";
  }
}

// ── Celebration Overlay ───────────────────────────────────────────────────

function CelebrationOverlay() {
  const hearts = ["❤️", "✨", "🌟", "💫", "❤️", "✨"];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {hearts.map((emoji, i) => (
        <motion.div
          key={i}
          className="absolute text-2xl"
          initial={{ y: 60, x: `${15 + i * 14}%`, opacity: 0 }}
          animate={{ y: -40, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.8, delay: i * 0.25, repeat: Infinity, repeatDelay: 1 }}
        >
          {emoji}
        </motion.div>
      ))}
    </div>
  );
}

// ── Break Overlay ─────────────────────────────────────────────────────────

function BreakOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <motion.div
        className="mt-4 text-4xl"
        animate={{ rotate: [-10, 10, -10] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        🎮
      </motion.div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function GameWorld({
  worldId,
  phase,
  focusProgress,
  returningProgress,
  me,
  partner,
  myPet,
  partnerPet,
}: Props) {
  const world = getWorld(worldId);

  // Calculate left offset for "me" (0 = far left, 0.45 = center-ish)
  const myLeft = useMemo(() => {
    if (phase === "celebration" || phase === "break") return "calc(50% - 100px)";
    if (phase === "returning") return `${(1 - returningProgress) * 40}%`;
    // focus or waiting
    return `calc(${focusProgress * 42}% + 8px)`;
  }, [phase, focusProgress, returningProgress]);

  // Calculate right offset for partner (0 = far right, 0.45 = center-ish)
  const partnerRight = useMemo(() => {
    if (phase === "celebration" || phase === "break") return "calc(50% - 100px)";
    if (phase === "returning") return `${(1 - returningProgress) * 40}%`;
    return `calc(${focusProgress * 42}% + 8px)`;
  }, [phase, focusProgress, returningProgress]);

  const myAnim = getCharacterAnim(phase, true);
  const partnerAnim = getCharacterAnim(phase, false);

  // Ground height: bottom 38% of world container
  const GROUND_HEIGHT = "38%";

  return (
    <div className="relative w-full" style={{ height: 280 }}>
      {/* Sky */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ background: world.skyGradient }}
      >
        {worldId === "forest" && <ForestDecor />}
        {worldId === "space" && <SpaceDecor />}
        {worldId === "beach" && <BeachDecor />}
      </div>

      {/* Ground */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: GROUND_HEIGHT,
          backgroundColor: world.groundColor,
        }}
      >
        {/* Ground texture strip */}
        <div
          className="absolute top-0 left-0 right-0 h-2"
          style={{ backgroundColor: world.groundPatternColor }}
        />
        {/* Ground dots / texture */}
        {worldId === "forest" && (
          <div className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `radial-gradient(circle, ${world.groundPatternColor} 1px, transparent 1px)`,
              backgroundSize: "18px 14px",
            }}
          />
        )}
        {worldId === "space" && (
          <div className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `linear-gradient(${world.groundPatternColor} 1px, transparent 1px)`,
              backgroundSize: "100% 8px",
            }}
          />
        )}
      </div>

      {/* Meeting heart marker */}
      <div className="absolute bottom-[36%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
        <motion.div
          className="text-2xl"
          animate={{ scale: phase === "celebration" ? [1, 1.4, 1] : 1, opacity: phase === "focus" ? 0.4 : 0.9 }}
          transition={{ duration: 0.8, repeat: phase === "celebration" ? Infinity : 0 }}
        >
          ❤️
        </motion.div>
        <div className="w-px h-8 bg-white/20" />
      </div>

      {/* Me (left side, walks right) */}
      <motion.div
        className="absolute z-20"
        style={{ bottom: "calc(38% - 4px)" }}
        animate={{ left: myLeft }}
        transition={{ type: "tween", ease: "linear", duration: 0.8 }}
      >
        <div className="flex items-end gap-1">
          {myPet && (
            <div className="mb-1">
              <PetCharacter type={myPet} anim={myAnim} facing="right" size={2} />
            </div>
          )}
          <PixelCharacter {...me.avatar} anim={myAnim} facing="right" size={3} />
        </div>
        <div className="text-[10px] text-center mt-1 font-bold text-white bg-black/50 rounded px-1 font-mono">
          YOU
        </div>
      </motion.div>

      {/* Partner (right side, walks left) */}
      {partner && (
        <motion.div
          className="absolute z-20"
          style={{ bottom: "calc(38% - 4px)" }}
          animate={{ right: partnerRight }}
          transition={{ type: "tween", ease: "linear", duration: 0.8 }}
        >
          <div className="flex items-end gap-1">
            <PixelCharacter {...partner.avatar} anim={partnerAnim} facing="left" size={3} />
            {partnerPet && (
              <div className="mb-1">
                <PetCharacter type={partnerPet} anim={partnerAnim} facing="left" size={2} />
              </div>
            )}
          </div>
          <div className="text-[10px] text-center mt-1 font-bold text-white bg-black/50 rounded px-1 font-mono">
            THEM
          </div>
        </motion.div>
      )}

      {/* Phase overlays */}
      <AnimatePresence>
        {phase === "celebration" && (
          <motion.div
            key="celebration"
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CelebrationOverlay />
          </motion.div>
        )}
        {phase === "break" && (
          <motion.div
            key="break"
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <BreakOverlay />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting state — partner slot empty */}
      {!partner && phase === "waiting" && (
        <div className="absolute right-4 bottom-[38%] flex flex-col items-center opacity-40">
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/50 flex items-center justify-center text-white text-lg">
            ?
          </div>
          <div className="text-[10px] text-center mt-1 font-bold text-white font-mono">
            WAITING
          </div>
        </div>
      )}
    </div>
  );
}
