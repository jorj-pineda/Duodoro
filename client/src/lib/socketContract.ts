import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../../shared/socketContract';

export type DuodoroSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type {
  AccountDeletionResponse,
  ClientToServerEvents,
  ServerToClientEvents,
  ShareInviteResponse,
} from '../../../shared/socketContract';
