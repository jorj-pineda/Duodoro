"use client";
import { useState } from "react";
import { motion } from "framer-motion";

// This type defines what an "Avatar" actually is in our code
export type AvatarConfig = {
  skin: number;
  eyes: number;
  hair: number;
  outfit: number;
};

// ----------------------
// ASSET CONFIGURATION
// ----------------------
// Later, you will replace these hex codes/strings with actual file paths like '/assets/eyes-1.png'
const ASSETS = {
  skins: ["#ffdbac", "#e0ac69", "#8d5524", "#c68642", "#f1c27d", "#aa724b"],
  eyes: ["Normal", "Anime", "Sleepy", "Sunglasses", "Cyclops"],
  hair: ["Bald", "Mohawk", "Bob", "Long", "Spiky"],
  outfits: ["Naked", "T-Shirt", "Suit", "Dress", "Astronaut"],
};

export default function AvatarCreator({
  onSave,
}: {
  onSave: (config: AvatarConfig) => void;
}) {
  const [config, setConfig] = useState<AvatarConfig>({
    skin: 0,
    eyes: 0,
    hair: 0,
    outfit: 0,
  });

  // Helper to cycle through arrays (prevents index out of bounds)
  const cycle = (category: keyof AvatarConfig, direction: 1 | -1) => {
    setConfig((prev) => {
      // Find the length of the array we are cycling through
      let max = 0;
      if (category === "skin") max = ASSETS.skins.length;
      if (category === "eyes") max = ASSETS.eyes.length;
      if (category === "hair") max = ASSETS.hair.length;
      if (category === "outfit") max = ASSETS.outfits.length;

      const nextIndex = (prev[category] + direction + max) % max;
      return { ...prev, [category]: nextIndex };
    });
  };

  return (
    <div className="flex flex-col items-center bg-gray-800 p-6 rounded-2xl shadow-2xl border-4 border-gray-700 w-full max-w-sm">
      <h2 className="text-xl font-bold mb-6 text-white font-mono tracking-widest text-center">
        DESIGN YOUR HERO
      </h2>

      {/* ----------------------
          AVATAR PREVIEW BOX
         ----------------------- */}
      <div className="relative w-40 h-40 mb-6 bg-sky-300 rounded-lg overflow-hidden border-4 border-white shadow-inner">
        {/* 1. BODY LAYER (Background Color) */}
        <motion.div
          className="absolute inset-0 w-24 h-24 bg-current mx-auto mt-10 rounded-xl"
          style={{ backgroundColor: ASSETS.skins[config.skin] }}
          key={config.skin} // Triggers a tiny pop animation when changed
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
        />

        {/* 2. EYES LAYER */}
        <div className="absolute inset-0 flex items-center justify-center pt-6 pointer-events-none">
          <span className="text-[10px] font-bold text-black bg-white/80 px-1 rounded backdrop-blur-sm">
            {ASSETS.eyes[config.eyes]}
          </span>
        </div>

        {/* 3. HAIR LAYER */}
        <div className="absolute top-4 w-full text-center text-[10px] text-black font-bold tracking-tighter">
          {ASSETS.hair[config.hair]}
        </div>

        {/* 4. OUTFIT LAYER */}
        <div className="absolute bottom-0 w-full h-10 bg-black/20 text-center text-[10px] text-white pt-2">
          {ASSETS.outfits[config.outfit]}
        </div>
      </div>

      {/* ----------------------
          CONTROLS
         ----------------------- */}
      <div className="w-full space-y-3 font-mono text-sm mb-6">
        <ControlRow
          label="SKIN"
          value={`Type ${config.skin + 1}`}
          onPrev={() => cycle("skin", -1)}
          onNext={() => cycle("skin", 1)}
        />
        <ControlRow
          label="HAIR"
          value={ASSETS.hair[config.hair]}
          onPrev={() => cycle("hair", -1)}
          onNext={() => cycle("hair", 1)}
        />
        <ControlRow
          label="EYES"
          value={ASSETS.eyes[config.eyes]}
          onPrev={() => cycle("eyes", -1)}
          onNext={() => cycle("eyes", 1)}
        />
        <ControlRow
          label="GEAR"
          value={ASSETS.outfits[config.outfit]}
          onPrev={() => cycle("outfit", -1)}
          onNext={() => cycle("outfit", 1)}
        />
      </div>

      <button
        onClick={() => onSave(config)}
        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl border-b-4 border-green-700 active:border-b-0 active:translate-y-1 transition-all"
      >
        READY TO FOCUS
      </button>
    </div>
  );
}

// Simple internal component for the rows
function ControlRow({ label, value, onPrev, onNext }: any) {
  return (
    <div className="flex items-center justify-between text-white bg-gray-900/50 p-2 rounded">
      <span className="w-12 text-gray-400 font-bold text-xs">{label}</span>
      <div className="flex items-center gap-3">
        <button
          onClick={onPrev}
          className="w-6 h-6 flex items-center justify-center bg-gray-700 rounded hover:bg-gray-600 font-bold"
        >
          ‹
        </button>
        <div className="w-20 text-center truncate text-xs">{value}</div>
        <button
          onClick={onNext}
          className="w-6 h-6 flex items-center justify-center bg-gray-700 rounded hover:bg-gray-600 font-bold"
        >
          ›
        </button>
      </div>
    </div>
  );
}
