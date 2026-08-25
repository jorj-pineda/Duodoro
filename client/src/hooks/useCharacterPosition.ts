import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import type { AnimState } from "@/components/PixelCharacter";
import type { GamePhase } from "@/components/GameWorld";

// ─────────────────────────────────────────────────────────────────────────────
// Where the two characters stand, in whole CSS pixels.
//
// This used to hand GameWorld percentage strings — `calc(41.7% + 8px)` — and
// animate them on `left`. A percentage of an arbitrary container width lands on
// a fractional pixel roughly always, and a sprite parked on x.5 has every
// vertical edge in it resampled across two device pixels. The character
// therefore shimmered for the whole focus phase, and sat softened at the meet
// point for the whole break — which is most of the time anyone is looking at
// the screen.
//
// So: measure the scene, round, and animate a transform rather than `left`
// (which also stops every frame of the walk triggering layout).
// ─────────────────────────────────────────────────────────────────────────────

/** Fraction of the scene width a character walks over a full focus phase. */
const WALK_SPAN = 0.42;
/** Fraction of the scene width the returning animation travels back over. */
const RETURN_SPAN = 0.4;
/** Gap from the wall at the start of a focus phase, in px. */
const START_INSET = 8;
/** Half the width of the pair standing together, in px. */
const MEET_HALF_WIDTH = 100;

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

/**
 * Distance from a character to its own edge of the scene — `me` to the left
 * edge, the partner to the right — in whole CSS pixels.
 *
 * Pure so the whole-pixel guarantee is testable without a layout engine.
 */
export function characterOffset(
  phase: GamePhase,
  focusProgress: number,
  returningProgress: number,
  sceneWidth: number,
): number {
  if (phase === "celebration" || phase === "break")
    return Math.round(sceneWidth / 2) - MEET_HALF_WIDTH;
  if (phase === "returning")
    return Math.round(sceneWidth * RETURN_SPAN * (1 - returningProgress));
  return Math.round(sceneWidth * WALK_SPAN * focusProgress) + START_INSET;
}

// There is no layout to measure while server-rendering, and useLayoutEffect
// warns there. In the browser it has to be the layout effect: useEffect would
// paint one frame with the characters at the far edge.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The scene box in CSS px, kept current across resizes.
 *
 * Height is measured as well as width because it decides the art pixel
 * (`artPxFor`), and a landscape phone is short rather than narrow.
 */
export function useSceneBox(ref: RefObject<HTMLElement | null>): {
  width: number;
  height: number;
} {
  const [box, setBox] = useState({ width: 0, height: 0 });

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      // Same object identity for the same numbers, or a ResizeObserver that
      // fires on every scroll-driven reflow would re-render the whole scene.
      setBox((prev) =>
        prev.width === el.clientWidth && prev.height === el.clientHeight
          ? prev
          : { width: el.clientWidth, height: el.clientHeight },
      );
    measure();
    // jsdom has no ResizeObserver; tests measure 0 and the offsets stay whole
    // numbers either way.
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return box;
}

/**
 * Tween toward `target`, snapping every frame to a whole pixel.
 *
 * Rounding the target alone is not enough: interpolating between two whole
 * pixels still passes through every fraction in between, so the sprite goes
 * soft each time the walk advances. Rounding the animated value keeps the
 * motion smooth in time and quantised in space, which is what pixel art wants.
 */
function useWholePixelX(target: number) {
  const reducedMotion = useReducedMotion();
  const raw = useMotionValue(target);

  useEffect(() => {
    const controls = animate(raw, target, {
      duration: reducedMotion ? 0 : 0.8,
      ease: "linear",
    });
    return () => controls.stop();
  }, [raw, target, reducedMotion]);

  return useTransform(raw, (v) => Math.round(v));
}

export function useCharacterPosition(
  phase: GamePhase,
  focusProgress: number,
  returningProgress: number,
  sceneWidth: number,
) {
  const offset = useMemo(
    () => characterOffset(phase, focusProgress, returningProgress, sceneWidth),
    [phase, focusProgress, returningProgress, sceneWidth],
  );

  // Both characters sit the same distance from their own wall; the partner's
  // wall is the right-hand one, so their shift runs the other way.
  const myX = useWholePixelX(offset);
  const partnerX = useWholePixelX(-offset);

  const myAnim = getCharacterAnim(phase);
  const partnerAnim = getCharacterAnim(phase);

  return { myX, partnerX, myAnim, partnerAnim };
}
