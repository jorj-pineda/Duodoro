import type { GamePhase } from "@/components/GameWorld";
import type { AvatarConfig } from "./avatarData";

export type AppStep = "loading" | "landing" | "avatar" | "home" | "game";

export interface PlayerData {
  avatar: AvatarConfig;
  displayName?: string;
}

export interface SyncPayload {
  mode: "pomodoro" | "flow";
  phase: GamePhase;
  focusDuration: number;
  breakDuration: number;
  phaseStartTime: number | null;
  world: string;
  players: Record<string, PlayerData>;
  playerCount: number;
  sessionId: string;
}

export interface PhaseChangePayload {
  mode: "pomodoro" | "flow";
  phase: GamePhase;
  phaseStartTime: number | null;
  focusDuration: number;
  breakDuration: number;
}

export interface InviteData {
  sessionId: string;
  worldId: string;
  fromName: string;
  fromUserId: string;
}
