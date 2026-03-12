import type { PetType } from "@/lib/types";
import { PET_OPTIONS } from "@/lib/types";

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
      <span className="text-gray-600 text-xs font-mono">PET:</span>
      <button
        onClick={() => (isPremium ? onSelect(null) : onPremiumClick())}
        className={`w-7 h-7 rounded-full border text-xs flex items-center justify-center transition-all ${
          selected === null
            ? "border-gray-500 bg-gray-700 text-gray-300"
            : "border-gray-700 bg-gray-800 text-gray-600 hover:border-gray-600"
        }`}
        title="No pet"
      >
        {"✕"}
      </button>
      {PET_OPTIONS.map(({ type, emoji, label }) => (
        <button
          key={type}
          onClick={() => (isPremium ? onSelect(type) : onPremiumClick())}
          className={`w-7 h-7 rounded-full border text-sm flex items-center justify-center transition-all ${
            selected === type
              ? "border-emerald-500 bg-emerald-500/20"
              : "border-gray-700 bg-gray-800 hover:border-gray-500"
          } ${!isPremium ? "opacity-50" : ""}`}
          title={isPremium ? label : `${label} (Premium)`}
        >
          {isPremium ? emoji : "🔒"}
        </button>
      ))}
    </div>
  );
}
