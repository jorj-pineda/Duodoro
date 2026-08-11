"use client";
import { useMemo } from "react";
import PixelSprite, { type PixelMap, type PixelPalette } from "./PixelSprite";
import { getWorld, type WorldId } from "@/lib/avatarData";
import { GROUND } from "@/lib/scene";

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
const MOUNTAIN_BACK: PixelPalette = {
  M: "#9aa3b0",
  m: "#8891a0",
  S: "#e8eef5",
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

const BUILDING_TALL: PixelMap = [
  "....A....",
  "....A....",
  "BBBBBBBBB",
  "ByBuByBuB",
  "BBBBBBBBB",
  "BuByBuByB",
  "BBBBBBBBB",
  "ByBuBuByB",
  "BBBBBBBBB",
  "BuByByBuB",
  "BBBBBBBBB",
  "ByBuByBuB",
  "BBBBBBBBB",
  "BuBuByBuB",
  "BBBBBBBBB",
  "BBBBBBBBB",
];
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

const CUP: PixelMap = [
  ".CCCCC..",
  ".CkkkCH.",
  ".CkkkCH.",
  ".CCCCC..",
  "..DDDD..",
];
const CUP_PALETTE: PixelPalette = {
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

// ── Shared layer helpers ────────────────────────────────────────────────────

/** Column heights (0–10) stretched full-width — stepped hills / skylines. */
function SteppedSilhouette({
  heights,
  color,
  height,
  opacity = 1,
  bottom = GROUND,
}: {
  heights: number[];
  color: string;
  height: string;
  opacity?: number;
  bottom?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${heights.length} 10`}
      preserveAspectRatio="none"
      className="absolute left-0 right-0 w-full"
      style={{ bottom, height, opacity, shapeRendering: "crispEdges" }}
      aria-hidden="true"
    >
      {heights.map((h, i) => (
        <rect key={i} x={i} y={10 - h} width={1} height={h} fill={color} />
      ))}
    </svg>
  );
}

const HILLS_BACK = [
  3, 3, 4, 4, 5, 5, 6, 6, 6, 5, 5, 4, 4, 3, 3, 3, 4, 5, 6, 7, 7, 6, 5, 4, 4,
  3, 3, 4, 4, 5, 5, 4,
];
const HILLS_FRONT = [
  2, 2, 2, 3, 3, 4, 4, 4, 3, 3, 2, 2, 3, 4, 5, 5, 5, 4, 3, 3, 2, 2, 2, 3, 4,
  4, 5, 5, 4, 3, 2, 2,
];
const SKYLINE = [
  3, 3, 3, 5, 5, 5, 5, 2, 2, 4, 4, 4, 7, 7, 7, 3, 3, 6, 6, 6, 2, 2, 5, 5, 5,
  8, 8, 4, 4, 4, 6, 6,
];
const SKYLINE_FAR = [
  2, 2, 4, 4, 4, 3, 3, 5, 5, 2, 2, 3, 3, 6, 6, 6, 4, 4, 2, 2, 5, 5, 3, 3, 3,
  4, 4, 6, 6, 3, 3, 2,
];

/** Deterministic star field; a third of the stars twinkle on a stagger. */
function Stars({
  count,
  color = "#ffffff",
  maxY = 60,
  baseOpacity = 0.55,
}: {
  count: number;
  color?: string;
  maxY?: number;
  baseOpacity?: number;
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
            left: `${s.x}%`,
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
  scale = 2,
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
}: {
  left?: number;
  right?: number;
  children: React.ReactNode;
  z?: number;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: left !== undefined ? `${left}%` : undefined,
        right: right !== undefined ? `${right}%` : undefined,
        bottom: GROUND,
        zIndex: z,
      }}
    >
      {children}
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

export function ForestDecor() {
  return (
    <>
      <div
        className="absolute right-[10%] top-[8%]"
        style={{ filter: "drop-shadow(0 0 12px #ffd16688)" }}
      >
        <PixelSprite map={SUN} palette={SUN_PALETTE} scale={4} />
      </div>
      <DriftingCloud left={10} top={12} scale={3} slow />
      <DriftingCloud left={38} top={7} scale={2} delay={4} />
      <DriftingCloud left={64} top={17} scale={2} delay={9} slow />
      <DriftingCloud left={84} top={26} scale={2} delay={2} opacity={0.7} />
      <SteppedSilhouette
        heights={HILLS_BACK}
        color="#a4cdb0"
        height="13%"
        opacity={0.8}
      />
      <SteppedSilhouette heights={HILLS_FRONT} color="#7db892" height="9%" />
      <Grounded left={3}>
        <PixelSprite map={PINE} palette={PINE_PALETTE} scale={4} />
      </Grounded>
      <Grounded left={12}>
        <PixelSprite map={PINE} palette={PINE_PALETTE} scale={3} />
      </Grounded>
      <Grounded right={12}>
        <PixelSprite map={PINE} palette={PINE_PALETTE} scale={4} />
      </Grounded>
      <Grounded right={4}>
        <PixelSprite map={PINE} palette={PINE_PALETTE} scale={3} />
      </Grounded>
    </>
  );
}

// ── Space — nebulas, twinkling stars, ringed planet, shooting star ──────────

export function SpaceDecor() {
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
      <Stars count={40} maxY={70} />
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

export function BeachDecor() {
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
      <Grounded right={7}>
        <PixelSprite map={PALM} palette={PALM_PALETTE} scale={4} />
      </Grounded>
      <Grounded left={8}>
        <PixelSprite map={UMBRELLA} palette={UMBRELLA_PALETTE} scale={4} />
      </Grounded>
    </>
  );
}

// ── City — far skyline, lit pixel towers, moon and sparse stars ─────────────

export function CityDecor() {
  return (
    <>
      <Stars count={14} maxY={40} baseOpacity={0.4} />
      <div
        className="absolute left-[10%] top-[6%]"
        style={{ filter: "drop-shadow(0 0 12px #fde68a66)" }}
      >
        <PixelSprite
          map={MOON}
          palette={{ M: "#fde68a", m: "#e8c96a" }}
          scale={4}
        />
      </div>
      <SteppedSilhouette
        heights={SKYLINE_FAR}
        color="#20263e"
        height="16%"
        opacity={0.9}
      />
      <Grounded left={4}>
        <PixelSprite map={BUILDING_TALL} palette={BUILDING_PALETTE} scale={3} />
      </Grounded>
      <Grounded left={13}>
        <PixelSprite map={BUILDING_SHORT} palette={BUILDING_PALETTE} scale={3} />
      </Grounded>
      <Grounded right={13}>
        <PixelSprite map={BUILDING_TALL} palette={BUILDING_PALETTE} scale={3} />
      </Grounded>
      <Grounded right={4}>
        <PixelSprite map={BUILDING_SHORT} palette={BUILDING_PALETTE} scale={3} />
      </Grounded>
    </>
  );
}

// ── Mountain — layered ranges, clouds, alpine pines ─────────────────────────

export function MountainDecor() {
  return (
    <>
      <div
        className="absolute right-[14%] top-[7%]"
        style={{ filter: "drop-shadow(0 0 12px #ffd16677)" }}
      >
        <PixelSprite map={SUN} palette={SUN_PALETTE} scale={3} />
      </div>
      <DriftingCloud left={8} top={13} scale={2} slow />
      <DriftingCloud left={52} top={8} scale={3} delay={5} slow />
      <DriftingCloud left={80} top={18} scale={2} delay={10} />
      {/* Back range */}
      <Grounded left={12}>
        <PixelSprite map={MOUNTAIN} palette={MOUNTAIN_BACK} scale={6} />
      </Grounded>
      <Grounded left={55}>
        <PixelSprite map={MOUNTAIN} palette={MOUNTAIN_BACK} scale={5} />
      </Grounded>
      {/* Front range */}
      <Grounded left={-2}>
        <PixelSprite map={MOUNTAIN} palette={MOUNTAIN_FRONT} scale={8} />
      </Grounded>
      <Grounded left={34}>
        <PixelSprite map={MOUNTAIN} palette={MOUNTAIN_FRONT} scale={7} />
      </Grounded>
      <Grounded right={-2}>
        <PixelSprite map={MOUNTAIN} palette={MOUNTAIN_FRONT} scale={8} />
      </Grounded>
      <Grounded left={20}>
        <PixelSprite map={PINE} palette={PINE_PALETTE} scale={2} />
      </Grounded>
      <Grounded right={24}>
        <PixelSprite map={PINE} palette={PINE_PALETTE} scale={2} />
      </Grounded>
    </>
  );
}

// ── Library — shelves, hanging reading lamps, warm glow ─────────────────────

export function LibraryDecor() {
  return (
    <>
      <div
        className="absolute top-[4%] left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: 260,
          height: 140,
          background:
            "radial-gradient(ellipse at center, #ff8f0033, transparent 70%)",
        }}
      />
      <div
        className="absolute left-[30%] top-0"
        style={{ filter: "drop-shadow(0 4px 10px #ffe08266)" }}
      >
        <PixelSprite map={LAMP} palette={LAMP_PALETTE} scale={3} />
      </div>
      <div
        className="absolute right-[30%] top-0"
        style={{ filter: "drop-shadow(0 4px 10px #ffe08266)" }}
      >
        <PixelSprite map={LAMP} palette={LAMP_PALETTE} scale={3} />
      </div>
      <Grounded left={4}>
        <PixelSprite map={BOOKSHELF} palette={BOOKSHELF_PALETTE} scale={4} />
      </Grounded>
      <Grounded right={4}>
        <PixelSprite map={BOOKSHELF} palette={BOOKSHELF_PALETTE} scale={4} />
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

function CafeTable({ left, right }: { left?: number; right?: number }) {
  return (
    <Grounded left={left} right={right}>
      <div className="relative">
        <div className="absolute" style={{ bottom: "100%", left: 10 }}>
          <PixelSprite map={CUP} palette={CUP_PALETTE} scale={2} />
        </div>
        <SteamPuffs left="16px" bottom="calc(100% + 12px)" />
        <PixelSprite map={TABLE} palette={TABLE_PALETTE} scale={3} />
      </div>
    </Grounded>
  );
}

export function CafeDecor() {
  return (
    <>
      <div
        className="absolute right-[10%] top-[10%] opacity-80"
        style={{ filter: "drop-shadow(0 0 14px #ffd16655)" }}
      >
        <PixelSprite map={SUN} palette={SUN_PALETTE} scale={3} />
      </div>
      <StringLights />
      <CafeTable left={6} />
      <CafeTable right={6} />
    </>
  );
}

// ── World decor dispatcher — one component per worldId ──────────────────────

export function WorldDecor({ worldId }: { worldId: WorldId }) {
  switch (worldId) {
    case "forest":
      return <ForestDecor />;
    case "space":
      return <SpaceDecor />;
    case "beach":
      return <BeachDecor />;
    case "city":
      return <CityDecor />;
    case "mountain":
      return <MountainDecor />;
    case "library":
      return <LibraryDecor />;
    case "cafe":
      return <CafeDecor />;
    case "lofi":
      return <LofiDecor />;
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

export function LofiDecor() {
  return (
    <>
      <Stars count={25} color="#c084fc" maxY={55} baseOpacity={0.45} />
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
      <SteppedSilhouette
        heights={SKYLINE_FAR}
        color="#341d66"
        height="18%"
        opacity={0.7}
      />
      <SteppedSilhouette heights={SKYLINE} color="#241250" height="12%" />
    </>
  );
}
