"use client";
import type { PetType } from "@/lib/types";
import { PET_OPTIONS } from "@/lib/types";
import PetCharacter from "./PetCharacter";
import { CloseIcon, LockIcon } from "./Icons";

export default function PetPicker({
  selected,
  onSelect,
  isPremium,
  onPremiumClick,
}: {
  selected: PetType | null;
  onSelect: (pet: PetType | null) => void;
  isPremium: boolean;
  onPremiumClick: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-center">
      <span className="text-faint text-xs font-medium uppercase tracking-wide">Pet:</span>
      <button
        onClick={() => (isPremium ? onSelect(null) : onPremiumClick())}
        className={`w-7 h-7 border flex items-center justify-center transition-all ${
          selected === null
            ? "border-faint bg-raise text-ink"
            : "border-line bg-surface text-faint hover:border-faint"
        }`}
        title="No pet"
        aria-label="No pet"
      >
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
      {PET_OPTIONS.map(({ type, label }) => (
        <button
          key={type}
          onClick={() => (isPremium ? onSelect(type) : onPremiumClick())}
          className={`w-7 h-7 border flex items-end justify-center overflow-hidden transition-all ${
            selected === type
              ? "border-accent bg-accent/15"
              : "border-line bg-surface hover:border-faint"
          } ${!isPremium ? "opacity-50" : ""}`}
          title={isPremium ? label : `${label} (Premium)`}
        >
          {isPremium ? (
            <PetCharacter type={type} stage="grown" size={2} />
          ) : (
            <span className="flex items-center justify-center w-full h-full">
              <LockIcon className="w-3.5 h-3.5" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
