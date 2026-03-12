import { useMemo } from "react";
import type { AnimState } from "@/components/PixelCharacter";
import type { GamePhase } from "@/components/GameWorld";

export function getCharacterAnim(phase: GamePhase): AnimState {
  switch (phase) {
    case "waiting":
      return "idle";
    case "focus":
      return "walk";
    case "celebration":
      return "jump";
    case "break":
      return "sit";
    case "returning":
      return "float";
    default:
      return "idle";
  }
}

export function useCharacterPosition(
  phase: GamePhase,
  focusProgress: number,
  returningProgress: number,
) {
  const myLeft = useMemo(() => {
    if (phase === "celebration" || phase === "break")
      return "calc(50% - 100px)";
    if (phase === "returning") return `${(1 - returningProgress) * 40}%`;
    return `calc(${focusProgress * 42}% + 8px)`;
  }, [phase, focusProgress, returningProgress]);

  const partnerRight = useMemo(() => {
    if (phase === "celebration" || phase === "break")
      return "calc(50% - 100px)";
    if (phase === "returning") return `${(1 - returningProgress) * 40}%`;
    return `calc(${focusProgress * 42}% + 8px)`;
  }, [phase, focusProgress, returningProgress]);

  const myAnim = getCharacterAnim(phase);
  const partnerAnim = getCharacterAnim(phase);

  return { myLeft, partnerRight, myAnim, partnerAnim };
}
