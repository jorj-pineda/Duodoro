import type { GamePhase } from "@/components/GameWorld";
import type { AvatarConfig } from "./avatarData";
import type { PetType } from "./types";

export type AppStep = "loading" | "landing" | "avatar" | "home" | "game";

export interface PlayerData {
  avatar: AvatarConfig;
  displayName?: string;
  /** Supabase user id. The server has always put this in the slot and shipped
   *  it in the sync payload; declaring it lets the shared-goals board map a
   *  task's owner_id to a name without a second round trip. */
  userId?: string | null;
  pet?: PetType | null;
  /** True while the player's socket dropped and the server is holding their
   *  spot during the reconnect grace window. */
  disconnected?: boolean;
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
