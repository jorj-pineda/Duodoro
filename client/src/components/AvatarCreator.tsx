"use client";
import { useState } from "react";
import PixelCharacter from "./PixelCharacter";
import {
  SKIN_COLORS,
  HAIR_COLORS,
  OUTFIT_COLORS,
  HAIR_STYLES,
  EYE_STYLES,
  HAIR_STYLE_LABELS,
  EYE_STYLE_LABELS,
  DEFAULT_AVATAR,
  type AvatarConfig,
  type EyeStyle,
} from "@/lib/avatarData";

interface Props {
  onSave: (config: AvatarConfig, displayName: string) => void;
  initialConfig?: AvatarConfig;
  initialDisplayName?: string;
  /** When provided, shows a back button (edit mode, not first setup) */
  onBack?: () => void;
}

function ColorSwatch({
  colors,
  selected,
  onSelect,
}: {
  colors: { label: string; hex: string }[];
  selected: string;
  onSelect: (hex: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {colors.map(({ hex, label }) => (
        <button
          key={hex}
          title={label}
          onClick={() => onSelect(hex)}
          className="w-7 h-7 rounded border-2 transition-all"
          style={{
            backgroundColor: hex,
            borderColor: selected === hex ? "white" : "transparent",
            boxShadow: selected === hex ? "0 0 0 2px #6ee7b7" : undefined,
          }}
        />
      ))}
    </div>
  );
}

function CycleRow<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  const idx = options.indexOf(value);
  const prev = () => onChange(options[(idx - 1 + options.length) % options.length]);
  const next = () => onChange(options[(idx + 1) % options.length]);

  return (
    <div className="flex items-center justify-between bg-gray-900/60 px-3 py-2 rounded-lg">
      <span className="text-gray-400 text-xs font-bold w-14">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={prev}
          className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-white font-bold"
        >
          ‹
        </button>
        <span className="w-20 text-center text-xs text-white">{labels[value]}</span>
        <button
          onClick={next}
          className="w-6 h-6 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded text-white font-bold"
        >
          ›
        </button>
      </div>
    </div>
  );
}

export default function AvatarCreator({ onSave, initialConfig, initialDisplayName, onBack }: Props) {
  const [config, setConfig] = useState<AvatarConfig>(initialConfig ?? DEFAULT_AVATAR);
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");

  const set = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const isEditing = !!onBack;

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-md mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-center text-white font-mono tracking-widest">
          Duodoro
        </h1>
        <p className="text-gray-400 text-center text-sm mt-1">
          {isEditing ? "Update your character" : "Focus together, no matter the distance"}
        </p>
      </div>

      <div className="bg-gray-800 p-6 rounded-2xl shadow-2xl border border-gray-700 w-full">
        <h2 className="text-lg font-bold text-white font-mono tracking-widest text-center mb-6">
          {isEditing ? "EDIT CHARACTER" : "DESIGN YOUR HERO"}
        </h2>

        {/* ── Live Preview ── */}
        <div className="flex justify-center mb-6">
          <div
            className="rounded-2xl border-4 border-gray-600 flex items-end justify-center overflow-hidden"
            style={{
              width: 120,
              height: 140,
              background: "linear-gradient(180deg, #7EC8E3 0%, #AEE5D8 100%)",
              paddingBottom: 12,
            }}
          >
            <PixelCharacter {...config} anim="idle" facing="right" size={3} />
          </div>
        </div>

        {/* ── Display Name ── */}
        {!isEditing && (
          <div className="mb-4">
            <p className="text-gray-400 text-xs font-bold font-mono mb-2">YOUR NAME</p>
            <input
              className="w-full px-3 py-2 bg-gray-900/60 border border-gray-600 rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="e.g. Jorge"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={24}
            />
          </div>
        )}

        {/* ── Controls ── */}
        <div className="space-y-3 font-mono text-sm mb-5">
          <CycleRow
            label="HAIR"
            options={HAIR_STYLES}
            labels={HAIR_STYLE_LABELS}
            value={config.hairStyle}
            onChange={(v) => set("hairStyle", v)}
          />
          <CycleRow
            label="EYES"
            options={EYE_STYLES}
            labels={EYE_STYLE_LABELS}
            value={config.eyeStyle}
            onChange={(v) => set("eyeStyle", v as EyeStyle)}
          />
        </div>

        {/* ── Color Pickers ── */}
        <div className="space-y-3 mb-6">
          <div>
            <p className="text-gray-400 text-xs font-bold font-mono mb-2">SKIN</p>
            <ColorSwatch colors={SKIN_COLORS} selected={config.skinColor} onSelect={(hex) => set("skinColor", hex)} />
          </div>
          <div>
            <p className="text-gray-400 text-xs font-bold font-mono mb-2">HAIR COLOR</p>
            <ColorSwatch colors={HAIR_COLORS} selected={config.hairColor} onSelect={(hex) => set("hairColor", hex)} />
          </div>
          <div>
            <p className="text-gray-400 text-xs font-bold font-mono mb-2">OUTFIT</p>
            <ColorSwatch colors={OUTFIT_COLORS} selected={config.outfitColor} onSelect={(hex) => set("outfitColor", hex)} />
          </div>
        </div>

        <button
          onClick={() => onSave(config, displayName.trim())}
          className="w-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold py-3 px-4 rounded-xl border-b-4 border-emerald-700 transition-all font-mono tracking-widest"
        >
          {isEditing ? "SAVE CHANGES →" : "READY TO FOCUS →"}
        </button>

        {onBack && (
          <button
            onClick={onBack}
            className="w-full mt-3 text-gray-500 hover:text-gray-300 text-sm font-mono transition-colors"
          >
            ← Cancel
          </button>
        )}
      </div>
    </div>
  );
}
