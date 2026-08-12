"use client";
import { useMemo } from "react";
import PixelSprite, { type PixelMap, type PixelPalette } from "./PixelSprite";
import { getWorld, type WorldId } from "@/lib/avatarData";
import { ART_PX, GROUND } from "@/lib/scene";
import Ridge from "./Ridge";
import Skyline from "./Skyline";
import Shelving from "./Shelving";
import {
  BARK,
  EMBER,
  FOLIAGE,
  GRASS,
  SNOW,
  STONE,
  blend,
  hazedPalette,
  type Depth,
} from "@/lib/palette";

// ─────────────────────────────────────────────────────────────────────────────
// World Decorations — pixel-art scenery for each world.
//
// Every prop-less component here renders inside GameWorld's sky container
// (absolute inset-0, overflow-hidden). The ground plane is GROUND tall
// (lib/scene.ts), so anything "standing" is anchored there. Scenes are built
// from three layers for depth: far silhouettes → mid sprites → near sprites,
// plus slow ambient motion (drifting clouds, twinkling stars, rising steam).
// ─────────────────────────────────────────────────────────────────────────────

// ── Scale deviations ────────────────────────────────────────────────────────
//
// None of the scenery is on ART_PX yet, and it cannot get there by editing the
// numbers below: a sprite's apparent pixel size *is* its scale, so a 16-cell
// map rendered at 3px is a 48px mountain, not a small-pixelled 128px one.
// Keeping the current on-screen size means redrawing each map at more cells.
// The cost, so the redraw (roadmap 7b) can be planned rather than discovered:
//
//   sprite          map      scale(s)      on-screen        cells @ ART_PX
//   MOUNTAIN        16x10    5, 6, 7, 8    80..128 wide     27x17 .. 43x27
//   BOOKSHELF       14x17    4             56x68            19x23
//   PALM            14x11    4             56x44            19x15
//   UMBRELLA        12x9     4             48x36            16x12
//   PINE            12x14    2, 3, 4       24..48 wide      8x9 .. 16x19
//   SUN             9x9      3, 4, 5       27..45           9x9 .. 15x15
//   MOON            8x8      4, 5          32..40           11x11 .. 13x13
//   PLANET          16x9     2, 4          32..64 wide      11x6 .. 21x12
//   CLOUD           12x4     2, 3          24..36 wide      8x3 .. 12x4
//   BUILDING_*      -        2, 3          -                already at/near 3
//   LAMP, TABLE     -        3             -                already at ART_PX
//
// MountainDecor alone renders at 5, 6, 7 and 8 in a single frame, with the
// character beside it at 3. Mismatched pixel density is the clearest tell of
// amateur pixel art, so this list is the debt, not the design.
//
// ── Sprite maps ─────────────────────────────────────────────────────────────

const CLOUD: PixelMap = [
  "...WWWWW....",
  ".WWWWWWWWW..",
  "WWWWWWWWWWWW",
  ".SWWWWWWWWS.",
];
const CLOUD_PALETTE: PixelPalette = { W: "#ffffff", S: "#dbe5ee" };

const PINE: PixelMap = [
  ".....DD.....",
  "....DDDD....",
  "...DDDDDD...",
  "....MMMM....",
  "...MMMMMM...",
  "..MMMMMMMM..",
  "...LLLLLL...",
  "..LLLLLLLL..",
  ".LLLLLLLLLL.",
  "LLLLLLLLLLLL",
  ".....TT.....",
  ".....TT.....",
  ".....TT.....",
  "....TTTT....",
];
const PINE_PALETTE: PixelPalette = {
  D: "#2d6a4f",
  M: "#40916c",
  L: "#52b788",
  T: "#6b4f2a",
};

const SUN: PixelMap = [
  "...GGG...",
  "..GYYYG..",
  ".GYYYYYG.",
  "GYYYHYYYG",
  "GYYHHHYYG",
  "GYYYHYYYG",
  ".GYYYYYG.",
  "..GYYYG..",
  "...GGG...",
];
const SUN_PALETTE: PixelPalette = {
  G: "#f0b429",
  Y: "#ffd166",
  H: "#fff3b0",
};

const MOON: PixelMap = [
  "..MMMM..",
  ".MMMmm..",
  "MMMm....",
  "MMm.....",
  "MMm.....",
  "MMMm....",
  ".MMMmm..",
  "..MMMM..",
];

const PLANET: PixelMap = [
  "......PPPP......",
  "....PPPPPPPP....",
  "...PPPddPPPPP...",
  "...PPPPPPPPPP...",
  "RRR.PPPPPPPP.RRR",
  ".RRRRRRRRRRRRRR.",
  "...PPPPPPPPPP...",
  "....PPddPPPP....",
  "......PPPP......",
];
const PLANET_PALETTE: PixelPalette = {
  P: "#c084fc",
  d: "#9f5ff0",
  R: "#e9d5ff",
};

const MINI_PLANET: PixelMap = [
  ".pppp.",
  "pppddp",
  "pppppp",
  "pddppp",
  "pppppp",
  ".pppp.",
];
const MINI_PLANET_PALETTE: PixelPalette = { p: "#f0abfc", d: "#c26bd9" };

const MOUNTAIN: PixelMap = [
  ".......SS.......",
  "......SSSS......",
  ".....SSSSSS.....",
  ".....MSSSSm.....",
  "....MMMSSmmm....",
  "...MMMMMmmmm....",
  "..MMMMMMmmmmm...",
  ".MMMMMMMmmmmmm..",
  "MMMMMMMMmmmmmmm.",
  "MMMMMMMMMmmmmmmm",
];
const MOUNTAIN_FRONT: PixelPalette = {
  M: "#7c8490",
  m: "#5f6875",
  S: "#f1f5f9",
};

const PALM: PixelMap = [
  ".GGGG....GGGG.",
  "GGGGGGLLGGGGGG",
  ".GGG.LLLL.GGG.",
  ".....CTTC.....",
  "......TT......",
  "......TTt.....",
  "......TTt.....",
  ".......TTt....",
  ".......TTt....",
  "........TTt...",
  "........TTt...",
];
const PALM_PALETTE: PixelPalette = {
  G: "#40916c",
  L: "#52b788",
  C: "#6b4226",
  T: "#a16207",
  t: "#78350f",
};

const UMBRELLA: PixelMap = [
  "....RRRR....",
  "..RRRRRRRR..",
  ".RRWWRRWWRR.",
  "RWWRRRRRRWWR",
  ".....PP.....",
  ".....PP.....",
  ".....PP.....",
  ".....PP.....",
  ".....PP.....",
];
const UMBRELLA_PALETTE: PixelPalette = {
  R: "#e76f51",
  W: "#fdf6ec",
  P: "#8d5a2b",
};

const BUILDING_SHORT: PixelMap = [
  "BBBBBBB",
  "ByBuByB",
  "BBBBBBB",
  "BuByBuB",
  "BBBBBBB",
  "ByByBuB",
  "BBBBBBB",
  "BuByByB",
  "BBBBBBB",
  "BBBBBBB",
];
const BUILDING_PALETTE: PixelPalette = {
  B: "#262640",
  y: "#ffd166",
  u: "#3b4261",
  A: "#94a3b8",
};

const BOOKSHELF: PixelMap = [
  "FFFFFFFFFFFFFF",
  "F112233445566F",
  "F112233445566F",
  "F112233445566F",
  "FFFFFFFFFFFFFF",
  "F445566112233F",
  "F445566112233F",
  "F445566112233F",
  "FFFFFFFFFFFFFF",
  "F2233ff661144F",
  "F2233ff661144F",
  "F2233ff661144F",
  "FFFFFFFFFFFFFF",
  "F663311224455F",
  "F663311224455F",
  "F663311224455F",
  "FFFFFFFFFFFFFF",
];
const BOOKSHELF_PALETTE: PixelPalette = {
  F: "#4e342e",
  f: "#33211c",
  "1": "#c62828",
  "2": "#1565c0",
  "3": "#2e7d32",
  "4": "#f9a825",
  "5": "#6a1b9a",
  "6": "#e65100",
};

const LAMP: PixelMap = [
  "....C....",
  "....C....",
  "....C....",
  "....C....",
  "..GGGGG..",
  ".GGGGGGG.",
  "..YYYYY..",
  "...YYY...",
];
const LAMP_PALETTE: PixelPalette = {
  C: "#3e2723",
  G: "#2e7d32",
  Y: "#ffe082",
};

export const CUP: PixelMap = [
  ".CCCCC..",
  ".CkkkCH.",
  ".CkkkCH.",
  ".CCCCC..",
  "..DDDD..",
];
export const CUP_PALETTE: PixelPalette = {
  C: "#fdf6ec",
  k: "#6b4226",
  // The handle had the same value as the cup wall, so defining a separate key
  // for it achieved nothing — it just read as one column of extra width. Reuses
  // the saucer's shade rather than introducing a colour.
  H: "#d9c8a8",
  D: "#d9c8a8",
};

const TABLE: PixelMap = [
  "TTTTTTTTTTTTTTTT",
  ".tt..........tt.",
  ".tt..........tt.",
  ".tt..........tt.",
  ".tt..........tt.",
];
const TABLE_PALETTE: PixelPalette = { T: "#8d5a2b", t: "#6e441f" };

// Espresso machine — the thing that makes a room read as a café rather than a
// brown wall with tables in it.
const MACHINE: PixelMap = [
  "MMMMMMMMMMMM",
  "MggMMggMMkkM",
  "MMMMMMMMMMMM",
  "MnnMMnnMMMMM",
  "MMMMMMMMMMMM",
  "DDDDDDDDDDDD",
];
const MACHINE_PALETTE: PixelPalette = {
  M: "#8d9299",
  D: "#5c6167",
  g: "#2f3438",
  k: "#c9c2b4",
  n: "#3f4449",
};

// Menu board over the counter.
const MENU: PixelMap = [
  "FFFFFFFFFFFFFF",
  "F.cc..cccc...F",
  "F.cc..cc.....F",
  "F.cccc.ccc...F",
  "F............F",
  "F.cc.cc..cc..F",
  "F.cccccc.....F",
  "FFFFFFFFFFFFFF",
];
const MENU_PALETTE: PixelPalette = { F: "#4a3a2c", c: "#d9cdb6" };

const CAKE_TONES = ["#c9a227", "#b5651d", "#8d5a2b", "#d9c8a8", "#7c4a3a"];


// A conifer at ART_PX is 60x111px against a 48x72 person — 1.54x human height.
// The old PINE was 48x56: shorter than the people standing under it, and with
// 33% bigger pixels. Boughs are tiered rather than one smooth triangle, and
// three of them are nicked on the left so the silhouette isn't perfectly
// regular — a symmetrical conifer reads as a christmas tree.
const PINE_TALL: PixelMap = [
  ".........MD.........",
  "........LMDD........",
  ".......LMMMDD.......",
  "......LMMMMDDD......",
  "........LMDD........",
  ".......LMMMDD.......",
  "......LMMMMDDD......",
  ".....LMMMMMDDDD.....",
  ".......LMMMDD.......",
  "......LMMMMDDD......",
  ".....LMMMMMDDDD.....",
  ".....MMMMMMDDDDD....",
  "......LMMMMDDD......",
  ".....LMMMMMDDDD.....",
  "....LMMMMMMDDDDD....",
  "...LMMMMMMMDDDDDD...",
  ".....LMMMMMDDDD.....",
  "....LMMMMMMDDDDD....",
  "...LMMMMMMMDDDDDD...",
  "...MMMMMMMMMDDDDDD..",
  "....LMMMMMMDDDDD....",
  "...LMMMMMMMDDDDDD...",
  "..LMMMMMMMMMDDDDDD..",
  ".LMMMMMMMMMMDDDDDDD.",
  "...LMMMMMMMDDDDDD...",
  "..LMMMMMMMMMDDDDDD..",
  ".LMMMMMMMMMMDDDDDDD.",
  "LMMMMMMMMMMMDDDDDDDD",
  "..LMMMMMMMMMDDDDDD..",
  ".LMMMMMMMMMMDDDDDDD.",
  "LMMMMMMMMMMMDDDDDDDD",
  ".MMMMMMMMMMMDDDDDDDD",
  "........tttT........",
  "........tttT........",
  ".......ttttTT.......",
  ".......ttttTT.......",
  "......tttttTTT......",
];
const PINE_TALL_PALETTE: PixelPalette = {
  L: FOLIAGE[4],
  M: FOLIAGE[2],
  D: FOLIAGE[1],
  t: BARK[2],
  T: BARK[1],
};

// Undergrowth. Its job is to break the line where trunks meet the ground, so
// the trees don't read as posted into a flat plane.
const BUSH: PixelMap = [
  "...LMM....",
  ".LMMMMDD..",
  "LMMMMMMDD.",
  "LMMMMMMDDD",
  ".MMMMMDDD.",
  "..MMMDDD..",
];
const BUSH_PALETTE: PixelPalette = { L: GRASS[3], M: GRASS[2], D: GRASS[1] };

// A spruce for the winter mountain: narrower and steeper than the forest pine
// (42x102 against the pine's 60x111), with snow settling on the outer edge of
// each bough where it would actually collect.
const SPRUCE: PixelMap = [
  "......MD......",
  ".....LMDD.....",
  "....LMMDDD....",
  ".....LMDD.....",
  "....LMMDDD....",
  "...SSMMDDss...",
  "....LMMDDD....",
  "...LMMMDDDD...",
  "..SSMMMDDDss..",
  "....LMMDDD....",
  "...LMMMDDDD...",
  "..LMMMMDDDDD..",
  ".SSMMMMMDDDss.",
  "...LMMMDDDD...",
  "..LMMMMDDDDD..",
  ".LMMMMMMDDDDD.",
  "SSMMMMMMDDDDss",
  "...MMMMDDDDD..",
  ".LMMMMMMDDDDD.",
  "LMMMMMMMDDDDDD",
  "SSMMMMMMDDDDss",
  ".LMMMMMMDDDDD.",
  "LMMMMMMMDDDDDD",
  "LMMMMMMMDDDDDD",
  "SSMMMMMMDDDDss",
  ".LMMMMMMDDDDD.",
  ".MMMMMMMDDDDDD",
  "LMMMMMMMDDDDDD",
  "LMMMMMMMDDDDDD",
  "SSMMMMMMDDDDss",
  "......ttT.....",
  "......ttT.....",
  ".....tttTT....",
  ".....tttTT....",
];
const SPRUCE_PALETTE: PixelPalette = {
  L: FOLIAGE[3],
  M: FOLIAGE[1],
  D: FOLIAGE[0],
  S: SNOW[3],
  s: SNOW[2],
  t: BARK[1],
  T: BARK[0],
};

// A boulder breaking through the snow, so the ground isn't one flat sheet.
const ROCK: PixelMap = [
  "..LLMM....",
  ".LLMMMMD..",
  "LLMMMMMDD.",
  "LMMMMMMDDD",
  "MMMMMMMDDD",
];
const ROCK_PALETTE: PixelPalette = { L: STONE[4], M: STONE[3], D: STONE[1] };


/** Keyline for a sprite at a given depth. The outline has to recede with
 *  everything else, or a far sprite reads as nearer than the ridge behind it. */
function keyline(sky: string, depth: Depth): string {
  return hazedPalette({ k: blend(FOLIAGE[0], "#000000", 0.4) }, sky, depth).k;
}

/**
 * The sky at the horizon for each world — what distance blends toward.
 *
 * Taken from the bottom stop of each world's skyGradient, because that is
 * literally the colour the air is at the point a far ridge meets it.
 */
const HORIZON: Record<WorldId, string> = {
  forest: "#AEE5D8",
  space: "#130840",
  beach: "#FFD166",
  city: "#16213e",
  mountain: "#E0F0FF",
  library: "#5d4037",
  cafe: "#e8d5b7",
  lofi: "#11063a",
};

/** Every decor scene needs the measured scene width: terrain is generated to
 *  cover it, and sprite positions are rounded to whole pixels against it. */
interface DecorProps {
  sceneWidth: number;
}

// ── Shared layer helpers ────────────────────────────────────────────────────

/** A percentage of the scene, snapped to a whole pixel once it is measurable. */
function pin(pct: number | undefined, sceneWidth: number): string | undefined {
  if (pct === undefined) return undefined;
  if (sceneWidth <= 0) return `${pct}%`;
  return `${Math.round((sceneWidth * pct) / 100)}px`;
}


/** Deterministic star field; a third of the stars twinkle on a stagger. */
function Stars({
  count,
  color = "#ffffff",
  maxY = 60,
  baseOpacity = 0.55,
  sceneWidth = 0,
}: {
  count: number;
  color?: string;
  maxY?: number;
  baseOpacity?: number;
  /** A 1px star placed at a percentage is a 1px star straddling two device
   *  pixels — i.e. two half-lit greys where there should be one white dot. */
  sceneWidth?: number;
}) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (i * 37 + 11) % 100,
        y: (i * 53 + 7) % maxY,
        size: i % 3 === 0 ? 2 : 1,
        twinkle: i % 3 === 0,
        delay: (i % 5) * 0.7,
      })),
    [count, maxY],
  );
  return (
    <>
      {stars.map((s, i) => (
        <div
          key={i}
          className={`absolute ${s.twinkle ? "decor-twinkle" : ""}`}
          style={{
            left:
              sceneWidth > 0
                ? `${Math.round((sceneWidth * s.x) / 100)}px`
                : `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            backgroundColor: color,
            opacity: baseOpacity + (i % 4) * 0.1,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </>
  );
}

function DriftingCloud({
  left,
  top,
  scale = ART_PX,
  delay = 0,
  slow = false,
  opacity = 0.95,
}: {
  left: number;
  top: number;
  scale?: number;
  delay?: number;
  slow?: boolean;
  opacity?: number;
}) {
  return (
    <div
      className={`absolute ${slow ? "decor-drift-slow" : "decor-drift"}`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        opacity,
        animationDelay: `${delay}s`,
      }}
    >
      <PixelSprite map={CLOUD} palette={CLOUD_PALETTE} scale={scale} />
    </div>
  );
}

function Grounded({
  left,
  right,
  children,
  z = 0,
  shadow,
  sceneWidth = 0,
}: {
  left?: number;
  right?: number;
  children: React.ReactNode;
  z?: number;
  /** Measured scene width. A percentage offset lands on a fractional pixel and
   *  softens every edge in the sprite, same as it did for the characters. */
  sceneWidth?: number;
  /** Width of the contact shadow in art pixels. Without one a sprite hovers:
   *  nothing tells the eye where the object meets the plane it stands on. */
  shadow?: number;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: pin(left, sceneWidth),
        right: pin(right, sceneWidth),
        bottom: GROUND,
        zIndex: z,
      }}
    >
      {children}
      {shadow !== undefined && (
        <div
          className="absolute left-1/2"
          style={{
            bottom: -ART_PX,
            width: shadow * ART_PX,
            height: ART_PX,
            marginLeft: -Math.round((shadow * ART_PX) / 2),
            background: "#000000",
            opacity: 0.26,
          }}
        />
      )}
    </div>
  );
}

function SteamPuffs({ left, bottom }: { left: string; bottom: string }) {
  return (
    <div className="absolute" style={{ left, bottom }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="decor-steam absolute rounded-none bg-white/70"
          style={{
            width: 2,
            height: 2,
            left: i * 4 - 2,
            animationDelay: `${i * 1.3}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Forest — daytime, layered hills, drifting clouds, pine clusters ─────────

export function ForestDecor({ sceneWidth }: DecorProps) {
  const sky = HORIZON.forest;
  const tree = (depth: Depth) => hazedPalette(PINE_TALL_PALETTE, sky, depth);
  const bush = (depth: Depth) => hazedPalette(BUSH_PALETTE, sky, depth);
  return (
    <>
      <div
        className="absolute right-[10%] top-[8%]"
        style={{ filter: "drop-shadow(0 0 12px #ffd16688)" }}
      >
        <PixelSprite map={SUN} palette={SUN_PALETTE} scale={ART_PX} />
      </div>
      <DriftingCloud left={10} top={12} slow />
      <DriftingCloud left={38} top={7} delay={4} />
      <DriftingCloud left={64} top={17} delay={9} slow />
      <DriftingCloud left={84} top={26} delay={2} opacity={0.7} />

      {/* Three bands of hill. Each is the same green ramp pushed further
          toward the sky, so the depth is carried by contrast, not by size. */}
      <Ridge
        spec={{ seed: 11, base: 26, amplitude: 15, wavelength: 44 }}
        sceneWidth={sceneWidth}
        ramp={FOLIAGE}
        sky={sky}
        depth="far"
      />
      <Ridge
        spec={{ seed: 23, base: 16, amplitude: 11, wavelength: 30 }}
        sceneWidth={sceneWidth}
        ramp={FOLIAGE}
        sky={sky}
        depth="mid"
        zIndex={1}
      />
      <Ridge
        spec={{ seed: 37, base: 8, amplitude: 6, wavelength: 19, detail: 3 }}
        sceneWidth={sceneWidth}
        ramp={GRASS}
        sky={sky}
        depth="near"
        zIndex={2}
      />

      {/* Trees at two depths, so the treeline has front and back. */}
      <Grounded left={6} z={3} sceneWidth={sceneWidth}>
        <PixelSprite
          map={PINE_TALL}
          palette={tree("mid")}
          scale={ART_PX}
          outline={keyline(sky, "mid")}
        />
      </Grounded>
      <Grounded left={19} z={3} sceneWidth={sceneWidth}>
        <PixelSprite
          map={PINE_TALL}
          palette={tree("mid")}
          scale={ART_PX}
          outline={keyline(sky, "mid")}
        />
      </Grounded>
      <Grounded right={9} z={3} sceneWidth={sceneWidth}>
        <PixelSprite
          map={PINE_TALL}
          palette={tree("mid")}
          scale={ART_PX}
          outline={keyline(sky, "mid")}
        />
      </Grounded>
      <Grounded left={1} z={4} shadow={16} sceneWidth={sceneWidth}>
        <PixelSprite
          map={PINE_TALL}
          palette={tree("near")}
          scale={ART_PX}
          outline={keyline(sky, "near")}
        />
      </Grounded>
      <Grounded right={2} z={4} shadow={16} sceneWidth={sceneWidth}>
        <PixelSprite
          map={PINE_TALL}
          palette={tree("near")}
          scale={ART_PX}
          outline={keyline(sky, "near")}
        />
      </Grounded>

      {/* Undergrowth, to break the line where the trunks meet the ground. */}
      <Grounded left={13} z={4} sceneWidth={sceneWidth}>
        <PixelSprite map={BUSH} palette={bush("near")} scale={ART_PX} />
      </Grounded>
      <Grounded right={17} z={4} sceneWidth={sceneWidth}>
        <PixelSprite map={BUSH} palette={bush("near")} scale={ART_PX} />
      </Grounded>
    </>
  );
}

// ── Space — nebulas, twinkling stars, ringed planet, shooting star ──────────

export function SpaceDecor({ sceneWidth }: DecorProps) {
  return (
    <>
      <div
        className="absolute pointer-events-none"
        style={{
          left: "8%",
          top: "10%",
          width: 220,
          height: 160,
          background:
            "radial-gradient(ellipse at center, #7c3aed33, transparent 70%)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          right: "12%",
          bottom: "30%",
          width: 260,
          height: 180,
          background:
            "radial-gradient(ellipse at center, #2563eb22, transparent 70%)",
        }}
      />
      <Stars count={40} maxY={70} sceneWidth={sceneWidth} />
      <div
        className="absolute right-[8%] top-[8%]"
        style={{ filter: "drop-shadow(0 0 16px #7c3aed88)" }}
      >
        <PixelSprite map={PLANET} palette={PLANET_PALETTE} scale={4} />
      </div>
      <div className="absolute left-[14%] top-[30%] opacity-80">
        <PixelSprite map={MINI_PLANET} palette={MINI_PLANET_PALETTE} scale={2} />
      </div>
      <div
        className="decor-shooting-star absolute left-[70%] top-[14%] bg-white"
        style={{ width: 10, height: 2 }}
      />
    </>
  );
}

// ── Beach — sunset sun, ocean horizon bands, palm + umbrella ────────────────

function WaveBand({
  bottom,
  height,
  color,
}: {
  bottom: string;
  height: string;
  color: string;
}) {
  return (
    <div className="absolute left-0 right-0" style={{ bottom, height }}>
      <div
        className="absolute left-0 right-0 top-0"
        style={{
          height: 4,
          backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 8px, transparent 8px 16px)`,
        }}
      />
      <div
        className="absolute left-0 right-0"
        style={{ top: 4, bottom: 0, backgroundColor: color }}
      />
    </div>
  );
}

export function BeachDecor({ sceneWidth }: DecorProps) {
  return (
    <>
      <div
        className="absolute left-[8%] top-[6%]"
        style={{ filter: "drop-shadow(0 0 18px #ffd166aa)" }}
      >
        <PixelSprite map={SUN} palette={SUN_PALETTE} scale={5} />
      </div>
      <DriftingCloud left={40} top={10} scale={2} slow opacity={0.8} />
      <DriftingCloud left={70} top={20} scale={3} delay={6} slow opacity={0.7} />
      <WaveBand bottom={GROUND} height="12%" color="rgba(59,130,199,0.45)" />
      <WaveBand bottom={GROUND} height="7%" color="rgba(37,99,168,0.5)" />
      <Grounded sceneWidth={sceneWidth} right={7}>
        <PixelSprite map={PALM} palette={PALM_PALETTE} scale={4} />
      </Grounded>
      <Grounded sceneWidth={sceneWidth} left={8}>
        <PixelSprite map={UMBRELLA} palette={UMBRELLA_PALETTE} scale={4} />
      </Grounded>
    </>
  );
}

// ── City — far skyline, lit pixel towers, moon and sparse stars ─────────────

export function CityDecor({ sceneWidth }: DecorProps) {
  const sky = HORIZON.city;
  return (
    <>
      <Stars count={14} maxY={34} baseOpacity={0.4} sceneWidth={sceneWidth} />
      <div
        className="absolute left-[10%] top-[6%]"
        style={{ filter: "drop-shadow(0 0 12px #fde68a66)" }}
      >
        <PixelSprite
          map={MOON}
          palette={{ M: SNOW[3], m: SNOW[2] }}
          scale={ART_PX}
        />
      </div>

      {/* Four bands of Manhattan. The near towers are 96–140 art pixels — four
          to six times the 24-pixel character — because the old city's tallest
          building was 48px against a 72px person. */}
      <Skyline
        spec={{
          seed: 5,
          minHeight: 34,
          maxHeight: 62,
          minWidth: 7,
          maxWidth: 14,
          gap: 1,
        }}
        sceneWidth={sceneWidth}
        ramp={STONE}
        glow={EMBER[2]}
        sky={sky}
        depth="far"
        showWindows={false}
      />
      <Skyline
        spec={{
          seed: 23,
          minHeight: 52,
          maxHeight: 92,
          minWidth: 9,
          maxWidth: 17,
          gap: 1,
          roofs: ["flat", "flat", "tank", "antenna"],
        }}
        sceneWidth={sceneWidth}
        ramp={STONE}
        glow={EMBER[2]}
        sky={sky}
        depth="mid"
        zIndex={1}
      />
      <Skyline
        spec={{
          seed: 41,
          minHeight: 78,
          maxHeight: 124,
          minWidth: 11,
          maxWidth: 20,
          gap: 2,
          roofs: ["flat", "tank", "antenna", "setback", "spire"],
        }}
        sceneWidth={sceneWidth}
        ramp={STONE}
        glow={EMBER[1]}
        sky={sky}
        depth="near"
        zIndex={2}
      />
      {/* Street level: low blocks the characters walk in front of. */}
      <Skyline
        spec={{
          seed: 67,
          minHeight: 26,
          maxHeight: 44,
          minWidth: 13,
          maxWidth: 24,
          gap: 3,
          roofs: ["flat", "tank"],
        }}
        sceneWidth={sceneWidth}
        ramp={STONE}
        glow={EMBER[0]}
        sky={sky}
        depth="front"
        zIndex={3}
      />
    </>
  );
}

// ── Mountain — layered ranges, clouds, alpine pines ─────────────────────────

export function MountainDecor({ sceneWidth }: DecorProps) {
  const sky = HORIZON.mountain;
  const spruce = (depth: Depth) => hazedPalette(SPRUCE_PALETTE, sky, depth);
  return (
    <>
      <DriftingCloud left={8} top={16} slow opacity={0.85} />
      <DriftingCloud left={52} top={9} delay={5} slow opacity={0.8} />
      <DriftingCloud left={80} top={21} delay={10} opacity={0.75} />

      {/* Ranges, not hills. The far wall is 78 art pixels — 234px, more than
          three times the character — where the old one topped out at 80px
          total. Snow lines sit lower on the near ranges, which is backwards
          for altitude but right for reading: the near rock has to stay dark
          enough to hold the silhouette against the sky. */}
      <Ridge
        spec={{ seed: 5, base: 78, amplitude: 40, wavelength: 78, detail: 2 }}
        sceneWidth={sceneWidth}
        ramp={STONE}
        sky={sky}
        depth="far"
        capAbove={64}
        capColor={SNOW[3]}
      />
      <Ridge
        spec={{ seed: 19, base: 58, amplitude: 34, wavelength: 54, detail: 3 }}
        sceneWidth={sceneWidth}
        ramp={STONE}
        sky={sky}
        depth="mid"
        capAbove={52}
        capColor={SNOW[3]}
        zIndex={1}
      />
      <Ridge
        spec={{ seed: 31, base: 36, amplitude: 24, wavelength: 38, detail: 3 }}
        sceneWidth={sceneWidth}
        ramp={STONE}
        sky={sky}
        depth="near"
        capAbove={38}
        capColor={SNOW[2]}
        zIndex={2}
      />
      {/* Snowline foothills the treeline stands on. */}
      <Ridge
        spec={{ seed: 47, base: 9, amplitude: 6, wavelength: 20, detail: 3 }}
        sceneWidth={sceneWidth}
        ramp={SNOW}
        sky={sky}
        depth="front"
        zIndex={3}
      />

      {/* A treeline rather than two lonely trees. */}
      <Grounded left={3} z={4} sceneWidth={sceneWidth}>
        <PixelSprite map={SPRUCE} palette={spruce("mid")} scale={ART_PX} />
      </Grounded>
      <Grounded left={12} z={4} sceneWidth={sceneWidth}>
        <PixelSprite map={SPRUCE} palette={spruce("mid")} scale={ART_PX} />
      </Grounded>
      <Grounded left={21} z={4} sceneWidth={sceneWidth}>
        <PixelSprite map={SPRUCE} palette={spruce("mid")} scale={ART_PX} />
      </Grounded>
      <Grounded right={4} z={4} sceneWidth={sceneWidth}>
        <PixelSprite map={SPRUCE} palette={spruce("mid")} scale={ART_PX} />
      </Grounded>
      <Grounded right={13} z={4} sceneWidth={sceneWidth}>
        <PixelSprite map={SPRUCE} palette={spruce("mid")} scale={ART_PX} />
      </Grounded>
      <Grounded left={-2} z={5} shadow={12} sceneWidth={sceneWidth}>
        <PixelSprite
          map={SPRUCE}
          palette={spruce("near")}
          scale={ART_PX}
          outline={keyline(sky, "near")}
        />
      </Grounded>
      <Grounded right={-1} z={5} shadow={12} sceneWidth={sceneWidth}>
        <PixelSprite
          map={SPRUCE}
          palette={spruce("near")}
          scale={ART_PX}
          outline={keyline(sky, "near")}
        />
      </Grounded>

      {/* Rock breaking the snow so the ground isn't a flat sheet. */}
      <Grounded left={30} z={5} sceneWidth={sceneWidth}>
        <PixelSprite
          map={ROCK}
          palette={hazedPalette(ROCK_PALETTE, sky, "near")}
          scale={ART_PX}
        />
      </Grounded>
      <Grounded right={26} z={5} sceneWidth={sceneWidth}>
        <PixelSprite
          map={ROCK}
          palette={hazedPalette(ROCK_PALETTE, sky, "near")}
          scale={ART_PX}
        />
      </Grounded>
    </>
  );
}

// ── Library — shelves, hanging reading lamps, warm glow ─────────────────────

/** Book spine colours — deep, slightly desaturated, so a wall of them reads as
 *  leather and cloth rather than a sweet shop. */
const BOOK_TONES = [
  "#7c2f2a",
  "#8a5a25",
  "#2f5340",
  "#2b3f63",
  "#5a2f52",
  "#6d6a3a",
  "#a8875c",
  "#3d3a36",
];

export function LibraryDecor({ sceneWidth }: DecorProps) {
  const sky = HORIZON.library;
  return (
    <>
      {/* Warm pool of light from the hanging lamps. */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: 420,
          height: 260,
          background:
            "radial-gradient(ellipse at top center, #ffb74d33, transparent 72%)",
        }}
      />

      {/* A full wall of shelving, 66 art pixels — 198px, near three times the
          character — with the middle left clear so the pair aren't lost in it. */}
      <Shelving
        sceneWidth={sceneWidth}
        rows={66}
        spacing={11}
        seed={17}
        frame={BARK}
        tones={BOOK_TONES}
        sky={sky}
        depth="mid"
        bayWidth={34}
      />
      {/* A nearer run in front, shorter, so the room has depth rather than
          being one flat backdrop. */}
      <Shelving
        sceneWidth={sceneWidth}
        rows={40}
        spacing={10}
        seed={53}
        frame={BARK}
        tones={BOOK_TONES}
        sky={sky}
        depth="near"
        bayWidth={26}
        zIndex={2}
        clearFrom={Math.round(sceneWidth / ART_PX / 2) - 34}
        clearTo={Math.round(sceneWidth / ART_PX / 2) + 34}
      />

      {/* Hanging lamps, on their own flexes so they read as suspended. */}
      {[18, 38, 62, 82].map((left, i) => (
        <div
          key={i}
          className="absolute top-0"
          style={{
            left:
              sceneWidth > 0
                ? `${Math.round((sceneWidth * left) / 100)}px`
                : `${left}%`,
            filter: "drop-shadow(0 6px 14px #ffe08277)",
          }}
        >
          <PixelSprite map={LAMP} palette={LAMP_PALETTE} scale={ART_PX} />
        </div>
      ))}

      {/* Reading table under the middle gap. */}
      <Grounded left={40} z={3} sceneWidth={sceneWidth} shadow={20}>
        <div className="relative">
          <div className="absolute" style={{ bottom: "100%", left: 4 * ART_PX }}>
            <PixelSprite map={CUP} palette={CUP_PALETTE} scale={ART_PX} />
          </div>
          <PixelSprite map={TABLE} palette={TABLE_PALETTE} scale={ART_PX} />
        </div>
      </Grounded>
    </>
  );
}

// ── Café — string lights, tables with steaming cups ─────────────────────────

const BULB_COLORS = ["#ffd166", "#e76f51", "#52b788"];
const BULB_SAG = [2, 8, 13, 16, 16, 13, 8, 2];

function StringLights() {
  return (
    <div className="absolute left-[6%] right-[6%] top-[6%] h-6">
      {BULB_SAG.map((sag, i) => (
        <div
          key={i}
          className="decor-twinkle absolute"
          style={{
            left: `${(i / (BULB_SAG.length - 1)) * 100}%`,
            top: sag,
            width: 4,
            height: 4,
            backgroundColor: BULB_COLORS[i % BULB_COLORS.length],
            boxShadow: `0 0 6px ${BULB_COLORS[i % BULB_COLORS.length]}`,
            animationDelay: `${(i % 4) * 0.9}s`,
            animationDuration: "4.5s",
          }}
        />
      ))}
    </div>
  );
}

function CafeTable({
  left,
  right,
  sceneWidth,
}: {
  left?: number;
  right?: number;
  sceneWidth: number;
}) {
  return (
    <Grounded left={left} right={right} sceneWidth={sceneWidth} shadow={18}>
      <div className="relative">
        <div
          className="absolute"
          style={{ bottom: "100%", left: 4 * ART_PX }}
        >
          <PixelSprite map={CUP} palette={CUP_PALETTE} scale={ART_PX} />
        </div>
        <SteamPuffs
          left={`${6 * ART_PX}px`}
          bottom={`calc(100% + ${5 * ART_PX}px)`}
        />
        <PixelSprite map={TABLE} palette={TABLE_PALETTE} scale={ART_PX} />
      </div>
    </Grounded>
  );
}

export function CafeDecor({ sceneWidth }: DecorProps) {
  const sky = HORIZON.cafe;
  const px = (pct: number) =>
    sceneWidth > 0
      ? `${Math.round((sceneWidth * pct) / 100)}px`
      : `${pct}%`;
  return (
    <>
      {/* We are indoors. The old scene had the sun in it. */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: "46%",
          background:
            "linear-gradient(180deg, #d8c3a0 0%, #e8d5b7 70%, #e8d5b7 100%)",
        }}
      />
      {/* Wall panelling: boards and a rail, so the back isn't a flat wash. */}
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{
          bottom: GROUND,
          height: 13 * ART_PX,
          backgroundColor: "#c2a884",
          backgroundImage:
            "repeating-linear-gradient(90deg, #b0977512 0 " +
            3 * ART_PX +
            "px, transparent " +
            3 * ART_PX +
            "px " +
            6 * ART_PX +
            "px)",
        }}
      />
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{
          bottom: `calc(${GROUND} + ${13 * ART_PX}px)`,
          height: ART_PX,
          backgroundColor: "#8d6e4f",
        }}
      />

      <StringLights />

      {/* Back bar: shelves of cups and beans, the machine, and a menu board. */}
      <Shelving
        sceneWidth={sceneWidth}
        rows={26}
        spacing={9}
        seed={91}
        frame={BARK}
        tones={CAKE_TONES}
        sky={sky}
        depth="mid"
        bayWidth={22}
        bottom={`calc(${GROUND} + ${16 * ART_PX}px)`}
      />
      <div className="absolute" style={{ left: px(38), bottom: `calc(${GROUND} + ${16 * ART_PX}px)` }}>
        <PixelSprite map={MACHINE} palette={MACHINE_PALETTE} scale={ART_PX} />
      </div>
      <div className="absolute" style={{ left: px(56), bottom: `calc(${GROUND} + ${26 * ART_PX}px)` }}>
        <PixelSprite map={MENU} palette={MENU_PALETTE} scale={ART_PX} />
      </div>

      {/* Tables. Five of them, so it reads as a room with other people's
          seats in it rather than two props. */}
      <CafeTable sceneWidth={sceneWidth} left={4} />
      <CafeTable sceneWidth={sceneWidth} left={20} />
      <CafeTable sceneWidth={sceneWidth} right={20} />
      <CafeTable sceneWidth={sceneWidth} right={4} />
    </>
  );
}

// ── World decor dispatcher — one component per worldId ──────────────────────

export function WorldDecor({
  worldId,
  sceneWidth,
}: {
  worldId: WorldId;
  sceneWidth: number;
}) {
  switch (worldId) {
    case "forest":
      return <ForestDecor sceneWidth={sceneWidth} />;
    case "space":
      return <SpaceDecor sceneWidth={sceneWidth} />;
    case "beach":
      return <BeachDecor sceneWidth={sceneWidth} />;
    case "city":
      return <CityDecor sceneWidth={sceneWidth} />;
    case "mountain":
      return <MountainDecor sceneWidth={sceneWidth} />;
    case "library":
      return <LibraryDecor sceneWidth={sceneWidth} />;
    case "cafe":
      return <CafeDecor sceneWidth={sceneWidth} />;
    case "lofi":
      return <LofiDecor sceneWidth={sceneWidth} />;
  }
}

// ── World thumbnail — mini scene preview for pickers ────────────────────────

const THUMB_SPRITES: Record<
  WorldId,
  { map: PixelMap; palette: PixelPalette; scale: number }
> = {
  forest: { map: PINE, palette: PINE_PALETTE, scale: 2 },
  space: { map: PLANET, palette: PLANET_PALETTE, scale: 2 },
  beach: { map: PALM, palette: PALM_PALETTE, scale: 2 },
  city: { map: BUILDING_SHORT, palette: BUILDING_PALETTE, scale: 2 },
  mountain: { map: MOUNTAIN, palette: MOUNTAIN_FRONT, scale: 2 },
  library: { map: BOOKSHELF, palette: BOOKSHELF_PALETTE, scale: 2 },
  cafe: { map: CUP, palette: CUP_PALETTE, scale: 3 },
  lofi: { map: MOON, palette: { M: "#e0c3fc", m: "#b794f4" }, scale: 2 },
};

/** Tiny sky + ground + signature sprite; size it via the parent element. */
export function WorldThumbnail({ worldId }: { worldId: WorldId }) {
  const world = getWorld(worldId);
  const sprite = THUMB_SPRITES[worldId];
  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ background: world.skyGradient }}
      aria-hidden="true"
    >
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{ height: "24%", backgroundColor: world.groundColor }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ bottom: "20%" }}
      >
        <PixelSprite
          map={sprite.map}
          palette={sprite.palette}
          scale={sprite.scale}
        />
      </div>
    </div>
  );
}

// ── Lo-fi — purple night, twin skylines, big moon ───────────────────────────

export function LofiDecor({ sceneWidth }: DecorProps) {
  return (
    <>
      <Stars
        count={25}
        color="#c084fc"
        maxY={55}
        baseOpacity={0.45}
        sceneWidth={sceneWidth}
      />
      <div
        className="absolute right-[8%] top-[7%]"
        style={{ filter: "drop-shadow(0 0 18px #8b5cf688)" }}
      >
        <PixelSprite
          map={MOON}
          palette={{ M: "#e0c3fc", m: "#b794f4" }}
          scale={5}
        />
      </div>
      <div className="absolute left-[10%] top-[32%] opacity-60">
        <PixelSprite map={MINI_PLANET} palette={MINI_PLANET_PALETTE} scale={2} />
      </div>
      <Ridge
        spec={{ seed: 101, base: 32, amplitude: 24, wavelength: 11, detail: 1 }}
        sceneWidth={sceneWidth}
        ramp={STONE}
        sky={HORIZON.lofi}
        depth="far"
      />
      <Ridge
        spec={{ seed: 113, base: 20, amplitude: 17, wavelength: 7, detail: 1 }}
        sceneWidth={sceneWidth}
        ramp={STONE}
        sky={HORIZON.lofi}
        depth="mid"
        zIndex={1}
      />
    </>
  );
}
