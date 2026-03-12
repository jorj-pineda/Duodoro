"use client";
import { useMemo } from "react";

function PixelTree() {
  return (
    <div
      className="flex flex-col items-center"
      style={{ imageRendering: "pixelated" }}
    >
      <div
        className="w-0 h-0"
        style={{
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderBottom: "14px solid #2d6a4f",
        }}
      />
      <div
        className="w-0 h-0 -mt-2"
        style={{
          borderLeft: "13px solid transparent",
          borderRight: "13px solid transparent",
          borderBottom: "16px solid #40916c",
        }}
      />
      <div
        className="w-0 h-0 -mt-2"
        style={{
          borderLeft: "16px solid transparent",
          borderRight: "16px solid transparent",
          borderBottom: "18px solid #52b788",
        }}
      />
      <div className="w-3 h-8" style={{ backgroundColor: "#6b4f2a" }} />
    </div>
  );
}

function PalmTree() {
  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-1 mb-1">
        <div className="w-6 h-2 rounded-full bg-green-600 -rotate-45 origin-right" />
        <div className="w-6 h-2 rounded-full bg-green-500 rotate-45 origin-left" />
      </div>
      <div
        className="w-2 h-14 rounded-b-sm"
        style={{
          background: "linear-gradient(180deg, #a16207, #78350f)",
          transform: "rotate(5deg)",
        }}
      />
    </div>
  );
}

export function ForestDecor() {
  return (
    <>
      {/* Clouds */}
      {[
        [8, 14],
        [35, 8],
        [62, 18],
        [80, 10],
      ].map(([left, top], i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: `${left}%`, top: `${top}%` }}
        >
          <div className="flex gap-1 opacity-90">
            <div className="w-6 h-4 bg-white rounded-full" />
            <div className="w-8 h-5 bg-white rounded-full -ml-3 -mt-1" />
            <div className="w-5 h-4 bg-white rounded-full -ml-2" />
          </div>
        </div>
      ))}
      {/* Trees */}
      {[
        [5, 58],
        [12, 52],
        [82, 58],
        [90, 52],
      ].map(([left, bottom], i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: `${left}%`, bottom: `${bottom}%` }}
        >
          <PixelTree />
        </div>
      ))}
    </>
  );
}

export function SpaceDecor() {
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        x: (i * 37 + 11) % 100,
        y: (i * 53 + 7) % 65,
        size: i % 3 === 0 ? 2 : 1,
      })),
    [],
  );
  return (
    <>
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: 0.6 + (i % 4) * 0.1,
          }}
        />
      ))}
      {/* Planet */}
      <div
        className="absolute right-12 top-4 w-16 h-16 rounded-full opacity-70"
        style={{
          background: "radial-gradient(circle at 35% 35%, #c084fc, #4c1d95)",
          boxShadow: "0 0 20px #7c3aed55",
        }}
      />
      {/* Planet ring */}
      <div
        className="absolute right-6 top-10 w-28 h-6 border-2 border-purple-400 rounded-full opacity-40"
        style={{ transform: "rotateX(70deg)" }}
      />
    </>
  );
}

export function BeachDecor() {
  return (
    <>
      <div
        className="absolute left-8 top-4 w-14 h-14 rounded-full"
        style={{
          background: "radial-gradient(circle, #FFF9C4, #FFD166)",
          boxShadow: "0 0 24px #FFD16688",
        }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute"
          style={{
            bottom: `${42 + i * 3}%`,
            left: 0,
            right: 0,
            height: 8,
            background: "rgba(96, 165, 250, 0.4)",
            borderRadius: "50% 50% 0 0",
            transform: `scaleX(${1 + i * 0.1})`,
          }}
        />
      ))}
      <div className="absolute right-8 bottom-[40%]">
        <PalmTree />
      </div>
    </>
  );
}

export function CityDecor() {
  return (
    <>
      {[
        [6, 55],
        [14, 45],
        [22, 60],
        [72, 50],
        [80, 42],
        [88, 55],
      ].map(([left, h], i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${left}%`,
            bottom: "38%",
            width: 22,
            height: h,
            background: `linear-gradient(180deg, #2a2a3e, #1a1a2e)`,
            borderRadius: "2px 2px 0 0",
          }}
        >
          {[0.2, 0.4, 0.6, 0.8].map((t, j) => (
            <div
              key={j}
              className="absolute"
              style={{
                left: "30%",
                top: `${t * 100}%`,
                width: 4,
                height: 3,
                backgroundColor: (i + j) % 3 === 0 ? "#ffd166" : "#334155",
              }}
            />
          ))}
        </div>
      ))}
      <div
        className="absolute top-6 left-12 w-10 h-10 rounded-full"
        style={{
          background: "radial-gradient(circle, #fde68a, #fbbf24)",
          boxShadow: "0 0 20px #fbbf2466",
        }}
      />
    </>
  );
}

export function MountainDecor() {
  return (
    <>
      {[
        [8, 14],
        [55, 8],
        [82, 12],
      ].map(([left, top], i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: `${left}%`, top: `${top}%` }}
        >
          <div className="flex gap-1 opacity-90">
            <div className="w-6 h-4 bg-white rounded-full" />
            <div className="w-8 h-5 bg-white rounded-full -ml-3 -mt-1" />
            <div className="w-5 h-4 bg-white rounded-full -ml-2" />
          </div>
        </div>
      ))}
      {[
        { left: 2, w: 120, h: 70, color: "#6b7280" },
        { left: 25, w: 100, h: 55, color: "#7c8490" },
        { left: 65, w: 130, h: 75, color: "#5f6875" },
      ].map((m, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${m.left}%`,
            bottom: "38%",
            width: 0,
            height: 0,
            borderLeft: `${m.w / 2}px solid transparent`,
            borderRight: `${m.w / 2}px solid transparent`,
            borderBottom: `${m.h}px solid ${m.color}`,
          }}
        />
      ))}
      {[
        { left: 12, w: 30, h: 18 },
        { left: 78, w: 35, h: 20 },
      ].map((s, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${s.left}%`,
            bottom: `${38 + 12}%`,
            width: 0,
            height: 0,
            borderLeft: `${s.w / 2}px solid transparent`,
            borderRight: `${s.w / 2}px solid transparent`,
            borderBottom: `${s.h}px solid white`,
            opacity: 0.9,
          }}
        />
      ))}
    </>
  );
}

export function LibraryDecor() {
  return (
    <>
      {[6, 82].map((left, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${left}%`,
            bottom: "38%",
            width: 28,
            height: 80,
            background: "#4e342e",
            borderRadius: "2px 2px 0 0",
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((r) => (
            <div
              key={r}
              className="absolute"
              style={{
                left: 2,
                right: 2,
                top: 4 + r * 12,
                height: 10,
                background: [
                  "#c62828",
                  "#1565c0",
                  "#2e7d32",
                  "#f9a825",
                  "#6a1b9a",
                  "#e65100",
                ][r],
                borderRadius: 1,
                opacity: 0.8,
              }}
            />
          ))}
        </div>
      ))}
      <div
        className="absolute top-8 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full"
        style={{
          background: "radial-gradient(circle, #ffcc80, #ff8f00)",
          opacity: 0.6,
          boxShadow: "0 0 40px #ff8f0055",
        }}
      />
    </>
  );
}

export function CafeDecor() {
  return (
    <>
      <div
        className="absolute right-10 top-6 w-10 h-10 rounded-full"
        style={{
          background: "radial-gradient(circle, #FFF9C4, #FFD166)",
          boxShadow: "0 0 20px #FFD16644",
        }}
      />
      {[8, 85].map((left, i) => (
        <div
          key={i}
          className="absolute"
          style={{ left: `${left}%`, bottom: "38%" }}
        >
          <div className="w-5 h-16 bg-amber-900 rounded-t-sm" />
          <div className="w-12 h-2 bg-amber-800 rounded-full -ml-3.5 -mt-0.5" />
        </div>
      ))}
      <div className="absolute top-4 left-12 text-2xl opacity-40">{"☁️"}</div>
    </>
  );
}

export function LofiDecor() {
  const stars = useMemo(
    () =>
      Array.from({ length: 25 }, (_, i) => ({
        x: (i * 41 + 7) % 100,
        y: (i * 29 + 13) % 55,
        size: i % 4 === 0 ? 2 : 1,
      })),
    [],
  );
  return (
    <>
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            backgroundColor: "#c084fc",
            opacity: 0.4 + (i % 3) * 0.15,
          }}
        />
      ))}
      <div
        className="absolute right-8 top-6 w-14 h-14 rounded-full"
        style={{
          background: "radial-gradient(circle at 40% 40%, #e0c3fc, #8b5cf6)",
          boxShadow: "0 0 30px #8b5cf655",
          opacity: 0.8,
        }}
      />
      <div
        className="absolute left-6 top-10 w-8 h-8 rounded-full"
        style={{
          background: "radial-gradient(circle, #f0abfc, #a855f7)",
          opacity: 0.3,
          boxShadow: "0 0 16px #a855f755",
        }}
      />
    </>
  );
}
