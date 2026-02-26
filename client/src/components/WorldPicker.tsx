"use client";
import { WORLDS, type WorldId, type WorldConfig } from "@/lib/avatarData";

interface Props {
  onSelect: (world: WorldId) => void;
  onBack: () => void;
}

function WorldCard({
  world,
  onClick,
}: {
  world: WorldConfig;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-gray-700 hover:border-emerald-400 bg-gray-800 hover:bg-gray-750 transition-all active:scale-95 w-full"
    >
      {/* Mini world preview */}
      <div
        className="w-full h-20 rounded-xl overflow-hidden border border-gray-600 group-hover:border-emerald-500 transition-colors"
        style={{ background: world.skyGradient }}
      >
        {/* Ground strip */}
        <div
          className="absolute bottom-0 left-0 right-0 h-6 rounded-b-xl"
          style={{ backgroundColor: world.groundColor }}
        />
        {/* World-specific decorations */}
        {world.id === "forest" && (
          <div className="absolute inset-0 flex items-end px-3 pb-1 gap-3">
            <Tree color={world.groundColor} />
            <div className="flex-1" />
            <Tree color={world.groundColor} />
          </div>
        )}
        {world.id === "space" && (
          <div className="absolute inset-0">
            {[
              [2, 2], [5, 5], [8, 1], [11, 4], [14, 2], [3, 8], [9, 7],
            ].map(([cx, cy], i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-white rounded-full opacity-80"
                style={{ left: `${cx * 6}%`, top: `${cy * 8}%` }}
              />
            ))}
            <div
              className="absolute right-3 top-2 w-8 h-8 rounded-full opacity-60"
              style={{ background: "radial-gradient(circle, #a78bfa, #4c1d95)" }}
            />
          </div>
        )}
        {world.id === "beach" && (
          <div className="absolute bottom-4 left-0 right-0 h-3 opacity-60"
            style={{
              background: "repeating-linear-gradient(90deg, #60a5fa 0px, #60a5fa 8px, #3b82f6 8px, #3b82f6 16px)",
            }}
          />
        )}
      </div>

      <div className="text-center">
        <div className="text-2xl mb-1">{world.emoji}</div>
        <div className="text-white font-bold font-mono text-sm tracking-widest">
          {world.label.toUpperCase()}
        </div>
      </div>
    </button>
  );
}

function Tree({ color }: { color: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-5 h-5 rounded-sm" style={{ backgroundColor: "#2d6a4f" }} />
      <div className="w-4 h-4 rounded-sm -mt-1" style={{ backgroundColor: "#40916c" }} />
      <div className="w-1 h-3" style={{ backgroundColor: "#6b4f2a" }} />
    </div>
  );
}

export default function WorldPicker({ onSelect, onBack }: Props) {
  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-md mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-center text-white font-mono tracking-widest">
          DuoFocus
        </h1>
        <p className="text-gray-400 text-center text-sm mt-1">
          Choose your world
        </p>
      </div>

      <div className="bg-gray-800 p-6 rounded-2xl shadow-2xl border border-gray-700 w-full">
        <h2 className="text-lg font-bold text-white font-mono tracking-widest text-center mb-6">
          PICK A WORLD
        </h2>

        <div className="grid grid-cols-3 gap-3 relative">
          {WORLDS.map((world) => (
            <WorldCard key={world.id} world={world} onClick={() => onSelect(world.id)} />
          ))}
        </div>

        <button
          onClick={onBack}
          className="mt-4 w-full text-gray-400 hover:text-white text-sm font-mono transition-colors py-2"
        >
          ← Back to avatar
        </button>
      </div>
    </div>
  );
}
