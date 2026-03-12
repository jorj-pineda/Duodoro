"use client";
import { motion, AnimatePresence } from "framer-motion";
import PixelCharacter from "./PixelCharacter";
import PetCharacter from "./PetCharacter";
import { getWorld, type WorldId, type AvatarConfig } from "@/lib/avatarData";
import type { PetType } from "@/lib/types";
import { useCharacterPosition } from "@/hooks/useCharacterPosition";
import {
  ForestDecor,
  SpaceDecor,
  BeachDecor,
  CityDecor,
  MountainDecor,
  LibraryDecor,
  CafeDecor,
  LofiDecor,
} from "./WorldDecorations";

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
  //random placement for test
  focusProgress: number;
  /** 0–1: how far through the returning animation (1 = back at start) */
  returningProgress: number;
  me: PlayerInfo;
  partner: PlayerInfo | null;
  myPet?: PetType | null;
  partnerPet?: PetType | null;
  myName?: string;
  partnerName?: string;
}

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
          transition={{
            duration: 1.8,
            delay: i * 0.25,
            repeat: Infinity,
            repeatDelay: 1,
          }}
        >
          {emoji}
        </motion.div>
      ))}
    </div>
  );
}

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

export default function GameWorld({
  worldId,
  phase,
  focusProgress,
  returningProgress,
  me,
  partner,
  myPet,
  partnerPet,
  myName,
  partnerName,
}: Props) {
  const world = getWorld(worldId);
  const { myLeft, partnerRight, myAnim, partnerAnim } = useCharacterPosition(
    phase,
    focusProgress,
    returningProgress,
  );

  const GROUND_HEIGHT = "38%";

  return (
    <div className="relative w-full h-[50vh] min-h-[275px] max-h-[475px]">
      {/* Sky */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ background: world.skyGradient }}
      >
        {worldId === "forest" && <ForestDecor />}
        {worldId === "space" && <SpaceDecor />}
        {worldId === "beach" && <BeachDecor />}
        {worldId === "city" && <CityDecor />}
        {worldId === "mountain" && <MountainDecor />}
        {worldId === "library" && <LibraryDecor />}
        {worldId === "cafe" && <CafeDecor />}
        {worldId === "lofi" && <LofiDecor />}
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
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `radial-gradient(circle, ${world.groundPatternColor} 1px, transparent 1px)`,
              backgroundSize: "18px 14px",
            }}
          />
        )}
        {worldId === "space" && (
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `linear-gradient(${world.groundPatternColor} 1px, transparent 1px)`,
              backgroundSize: "100% 8px",
            }}
          />
        )}
        {worldId === "city" && (
          <div
            className="absolute inset-0 opacity-15"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${world.groundPatternColor} 0px, ${world.groundPatternColor} 2px, transparent 2px, transparent 20px)`,
            }}
          />
        )}
        {worldId === "mountain" && (
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `radial-gradient(circle, ${world.groundPatternColor} 1px, transparent 1px)`,
              backgroundSize: "16px 12px",
            }}
          />
        )}
        {worldId === "library" && (
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${world.groundPatternColor} 0px, ${world.groundPatternColor} 3px, transparent 3px, transparent 18px)`,
            }}
          />
        )}
        {worldId === "lofi" && (
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage: `radial-gradient(circle, #7c3aed33 1px, transparent 1px)`,
              backgroundSize: "12px 12px",
            }}
          />
        )}
      </div>

      {/* Meeting heart marker */}
      <div className="absolute bottom-[36%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
        <motion.div
          className="text-2xl"
          animate={{
            scale: phase === "celebration" ? [1, 1.4, 1] : 1,
            opacity: phase === "focus" ? 0.4 : 0.9,
          }}
          transition={{
            duration: 0.8,
            repeat: phase === "celebration" ? Infinity : 0,
          }}
        >
          ❤️
        </motion.div>
        <div className="w-px h-8 bg-white/20" />
      </div>

      {/* Me (left side, walks right) */}
      <motion.div
        className="absolute z-20"
        style={{ bottom: "calc(38% - 4px)" }}
        initial={{ left: myLeft }}
        animate={{ left: myLeft }}
        transition={{ type: "tween", ease: "linear", duration: 0.8 }}
      >
        <div className="flex items-end gap-1">
          {myPet && (
            <div className="mb-1">
              <PetCharacter
                type={myPet}
                anim={myAnim}
                facing="right"
                size={2}
              />
            </div>
          )}
          <PixelCharacter
            {...me.avatar}
            anim={myAnim}
            facing="right"
            size={3}
          />
        </div>
        <div className="text-[10px] text-center mt-1 font-bold text-white bg-black/50 rounded px-1 font-mono truncate max-w-[80px]">
          {myName ?? "YOU"}
        </div>
      </motion.div>

      {/* Partner (right side, walks left) */}
      {partner && (
        <motion.div
          key={partner.id}
          className="absolute z-20"
          style={{ bottom: "calc(38% - 4px)" }}
          initial={{ right: partnerRight }}
          animate={{ right: partnerRight }}
          transition={{ type: "tween", ease: "linear", duration: 0.8 }}
        >
          <div className="flex items-end gap-1">
            <PixelCharacter
              {...partner.avatar}
              anim={partnerAnim}
              facing="left"
              size={3}
            />
            {partnerPet && (
              <div className="mb-1">
                <PetCharacter
                  type={partnerPet}
                  anim={partnerAnim}
                  facing="left"
                  size={2}
                />
              </div>
            )}
          </div>
          <div className="text-[10px] text-center mt-1 font-bold text-white bg-black/50 rounded px-1 font-mono truncate max-w-[80px]">
            {partnerName ?? "THEM"}
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
