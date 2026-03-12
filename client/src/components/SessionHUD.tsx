import type { GamePhase } from "./GameWorld";
import type { PetType } from "@/lib/types";
import { formatTime } from "@/lib/format";
import PetPicker from "./PetPicker";

function DurationSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-3 w-full">
      <span className="text-gray-500 text-xs font-mono w-14 text-right shrink-0">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-emerald-500 h-1.5"
      />
      <span className="text-emerald-400 text-xs font-mono font-bold w-12 shrink-0">
        {value}
        {unit}
      </span>
    </div>
  );
}

function PhaseDots({
  filled = 0,
  total = 7,
}: {
  filled?: number;
  total?: number;
}) {
  return (
    <div className="flex gap-1.5 items-center">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full border transition-all ${
            i < filled
              ? "bg-emerald-500 border-emerald-500"
              : "bg-transparent border-gray-600"
          }`}
        />
      ))}
    </div>
  );
}

interface SessionHUDProps {
  phase: GamePhase;
  serverMode: "pomodoro" | "flow";
  sessionStarted: boolean;
  playerCount: number;
  timeLeft: number;
  flowElapsed: number;
  // Session config
  timerMode: "pomodoro" | "flow";
  focusDuration: number;
  breakDuration: number;
  onTimerModeChange: (mode: "pomodoro" | "flow") => void;
  onFocusDurationChange: (v: number) => void;
  onBreakDurationChange: (v: number) => void;
  // Pet
  myPet: PetType | null;
  onPetSelect: (pet: PetType | null) => void;
  isPremium: boolean;
  onPremiumClick: () => void;
  // Actions
  onStart: () => void;
  onStop: () => void;
  onFinishFlow: () => void;
  onLeave: () => void;
}

const phaseLabel: Record<GamePhase, (playerCount: number) => string> = {
  waiting: (pc) => (pc < 1 ? "SETTING UP..." : "READY TO FOCUS"),
  focus: () => "FOCUS TIME",
  celebration: () => "YOU MET!",
  break: () => "BREAK TIME",
  returning: () => "HEADING BACK...",
};

export default function SessionHUD({
  phase,
  serverMode,
  sessionStarted,
  playerCount,
  timeLeft,
  flowElapsed,
  timerMode,
  focusDuration,
  breakDuration,
  onTimerModeChange,
  onFocusDurationChange,
  onBreakDurationChange,
  myPet,
  onPetSelect,
  isPremium,
  onPremiumClick,
  onStart,
  onStop,
  onFinishFlow,
  onLeave,
}: SessionHUDProps) {
  const showTimer = phase === "focus" || phase === "break";
  const canStart = playerCount >= 1 && !sessionStarted && phase === "waiting";
  const canStop = sessionStarted && phase !== "waiting";

  return (
    <div className="flex-1 flex items-start justify-center px-6 pt-4">
      <div className="bg-gray-900/80 backdrop-blur-sm border border-gray-700/60 rounded-2xl px-8 py-5 flex flex-col items-center gap-3 shadow-2xl">
        <div className="text-sm font-mono font-bold tracking-widest text-gray-400 uppercase">
          {phaseLabel[phase](playerCount)}
        </div>

        {(phase === "focus" || phase === "break") && (
          <PhaseDots filled={phase === "focus" ? 4 : 0} />
        )}

        {showTimer && (
          <div className="text-6xl font-mono font-bold tracking-widest tabular-nums drop-shadow-lg flex flex-col items-center">
            {phase === "focus" && serverMode === "flow" && (
              <span className="text-xs text-emerald-500 mb-1 tracking-widest font-bold">
                FLOW ELAPSED
              </span>
            )}
            <span
              className={
                phase === "break" ? "text-blue-400" : "text-emerald-400"
              }
            >
              {phase === "focus" && serverMode === "flow"
                ? formatTime(Math.round(flowElapsed))
                : formatTime(timeLeft)}
            </span>
          </div>
        )}

        {!sessionStarted && phase === "waiting" && (
          <div className="w-full max-w-xs space-y-4 mt-1">
            <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
              <button
                onClick={() => onTimerModeChange("pomodoro")}
                className={`flex-1 py-1 text-xs font-mono font-bold rounded-md transition-colors ${
                  timerMode === "pomodoro"
                    ? "bg-emerald-500 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Pomodoro
              </button>
              <button
                onClick={() => onTimerModeChange("flow")}
                className={`flex-1 py-1 text-xs font-mono font-bold rounded-md transition-colors ${
                  timerMode === "flow"
                    ? "bg-blue-500 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Flowmodoro
              </button>
            </div>
            {timerMode === "pomodoro" ? (
              <>
                <DurationSlider
                  label="FOCUS"
                  value={focusDuration}
                  onChange={onFocusDurationChange}
                  min={5}
                  max={120}
                  step={5}
                  unit="m"
                />
                <DurationSlider
                  label="BREAK"
                  value={breakDuration}
                  onChange={onBreakDurationChange}
                  min={1}
                  max={30}
                  step={1}
                  unit="m"
                />
              </>
            ) : (
              <div className="text-center text-xs text-gray-400 font-mono px-4 py-2 bg-gray-800/50 rounded-lg border border-gray-700/50">
                Focus as long as you want. When you&apos;re done, you&apos;ll
                earn a break tailored to how long you worked (5:1 ratio).
              </div>
            )}
          </div>
        )}

        {phase === "waiting" && (
          <PetPicker
            selected={myPet}
            onSelect={onPetSelect}
            isPremium={isPremium}
            onPremiumClick={onPremiumClick}
          />
        )}

        {/* Player indicators */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${playerCount >= 1 ? "bg-emerald-400" : "bg-gray-600"}`}
          />
          <span className="text-gray-600 text-xs font-mono">YOU</span>
          {playerCount >= 2 && (
            <>
              <div className="w-8 h-px bg-gray-700" />
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-gray-600 text-xs font-mono">PARTNER</span>
            </>
          )}
          {playerCount < 2 && phase === "waiting" && (
            <>
              <div className="w-8 h-px bg-gray-700" />
              <div className="w-2 h-2 rounded-full bg-gray-600" />
              <span className="text-gray-600 text-xs font-mono">
                WAITING...
              </span>
            </>
          )}
        </div>

        {/* Start / stop */}
        <div className="flex flex-col items-center gap-2">
          {canStart && (
            <button
              onClick={onStart}
              className={`${timerMode === "flow" ? "bg-blue-500 hover:bg-blue-400 border-blue-700" : "bg-emerald-500 hover:bg-emerald-400 border-emerald-700"} active:scale-95 text-white font-bold px-10 py-3 rounded-full shadow-lg font-mono tracking-widest transition-all border-b-4 text-sm`}
            >
              {"▶"} START{playerCount < 2 ? " SOLO" : " SESSION"}
            </button>
          )}
          {playerCount < 2 && phase === "waiting" && (
            <p className="text-gray-600 text-xs font-mono text-center">
              Friends can join from their dashboard
            </p>
          )}
          {phase === "focus" && serverMode === "flow" && (
            <button
              onClick={onFinishFlow}
              className="bg-blue-500 hover:bg-blue-400 active:scale-95 text-white font-bold px-10 py-3 rounded-full shadow-lg font-mono tracking-widest transition-all border-b-4 border-blue-700 text-sm mt-2"
            >
              {"⏸"} TAKE BREAK
            </button>
          )}
          {canStop && (
            <button
              onClick={onStop}
              className="text-gray-600 hover:text-red-400 text-xs font-mono transition-colors mt-2"
            >
              end session
            </button>
          )}
          <button
            onClick={onLeave}
            className="text-gray-700 hover:text-gray-400 text-xs font-mono transition-colors mt-2"
          >
            {"←"} leave session
          </button>
        </div>
      </div>
    </div>
  );
}
