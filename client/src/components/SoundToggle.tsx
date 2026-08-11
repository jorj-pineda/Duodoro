"use client";
import { useSound } from "@/hooks/useSound";
import { SpeakerIcon, SpeakerMuteIcon } from "./Icons";

interface Props {
  className?: string;
  /** For use over dark game-world scenes regardless of theme */
  onScene?: boolean;
}

export default function SoundToggle({ className, onScene }: Props) {
  const { muted, toggleMuted } = useSound();
  return (
    <button
      onClick={(e) => {
        // Both top bars close their profile menu on any bubbled click.
        e.stopPropagation();
        toggleMuted();
      }}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      aria-pressed={muted}
      title={muted ? "Unmute" : "Mute"}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
        onScene
          ? "text-white/70 hover:text-white hover:bg-white/10"
          : "text-muted hover:text-ink hover:bg-raise"
      } ${className ?? ""}`}
    >
      {muted ? <SpeakerMuteIcon /> : <SpeakerIcon />}
    </button>
  );
}
