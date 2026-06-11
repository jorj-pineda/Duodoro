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
      <span className="text-faint text-xs font-medium uppercase tracking-wide">Pet:</span>
      <button
        onClick={() => (isPremium ? onSelect(null) : onPremiumClick())}
        className={`w-7 h-7 rounded-full border text-xs flex items-center justify-center transition-all ${
          selected === null
            ? "border-faint bg-raise text-ink"
            : "border-line bg-surface text-faint hover:border-faint"
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
              ? "border-accent bg-accent/15"
              : "border-line bg-surface hover:border-faint"
          } ${!isPremium ? "opacity-50" : ""}`}
          title={isPremium ? label : `${label} (Premium)`}
        >
          {isPremium ? emoji : "🔒"}
        </button>
      ))}
    </div>
  );
}
