const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: allowedOrigin }));
app.get('/health', (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigin, methods: ['GET', 'POST'] }
});

// rooms[roomCode] = {
//   phase: 'waiting' | 'focus' | 'celebration' | 'break' | 'returning',
//   focusDuration: number (seconds),
//   breakDuration: number (seconds),
//   phaseStartTime: number | null (ms),
//   phaseTimer: NodeJS.Timeout | null,
//   world: string,
//   players: { [socketId]: { avatar: AvatarConfig } }
// }
const rooms = {};

// socketToRoom[socketId] = roomCode
const socketToRoom = {};

function getRoom(roomCode) {
  return rooms[roomCode];
}

function buildSyncPayload(room) {
  return {
    phase: room.phase,
    focusDuration: room.focusDuration,
    breakDuration: room.breakDuration,
    phaseStartTime: room.phaseStartTime,
    world: room.world,
    players: room.players,
    playerCount: Object.keys(room.players).length,
  };
}

function advancePhase(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;

  // Clear any existing timer
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }

  const CELEBRATION_MS = 4000;
  const RETURNING_MS = 3500;

  let nextPhase;
  let delay;

  switch (room.phase) {
    case 'focus':
      nextPhase = 'celebration';
      delay = CELEBRATION_MS;
      break;
    case 'celebration':
      nextPhase = 'break';
      delay = room.breakDuration * 1000;
      break;
    case 'break':
      nextPhase = 'returning';
      delay = RETURNING_MS;
      break;
    case 'returning':
      nextPhase = 'focus';
      delay = room.focusDuration * 1000;
      break;
    default:
      return;
  }

  room.phase = nextPhase;
  room.phaseStartTime = Date.now();

  io.to(roomCode).emit('phase_change', {
    phase: nextPhase,
    phaseStartTime: room.phaseStartTime,
    focusDuration: room.focusDuration,
    breakDuration: room.breakDuration,
  });

  console.log(`[${roomCode}] Phase: ${nextPhase}`);

  // Schedule next transition
  room.phaseTimer = setTimeout(() => advancePhase(roomCode), delay);
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // join_room: { roomCode, avatar: AvatarConfig, world?: string, displayName?: string }
  socket.on('join_room', ({ roomCode, avatar, world, displayName }) => {
    // Leave any previous room
    const prevRoom = socketToRoom[socket.id];
    if (prevRoom && prevRoom !== roomCode) {
      leaveRoom(socket, prevRoom);
    }

    socket.join(roomCode);
    socketToRoom[socket.id] = roomCode;

    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        phase: 'waiting',
        focusDuration: 25 * 60,
        breakDuration: 5 * 60,
        phaseStartTime: null,
        phaseTimer: null,
        world: world || 'forest',
        players: {},
      };
    }

    rooms[roomCode].players[socket.id] = { avatar, displayName: displayName || 'Player' };

    const playerCount = Object.keys(rooms[roomCode].players).length;
    console.log(`[${roomCode}] ${displayName || socket.id} joined (${playerCount} players)`);

    // Notify everyone in the room of new player
    socket.to(roomCode).emit('player_joined', {
      playerId: socket.id,
      avatar,
      displayName: displayName || 'Player',
    });

    // Send full state to the joining player
    socket.emit('sync_state', buildSyncPayload(rooms[roomCode]));
  });

  // start_session: { roomCode, focusDuration (seconds), breakDuration (seconds) }
  socket.on('start_session', ({ roomCode, focusDuration, breakDuration }) => {
    const room = getRoom(roomCode);
    if (!room) return;
    if (Object.keys(room.players).length < 2) return; // Need 2 players

    room.focusDuration = focusDuration || 25 * 60;
    room.breakDuration = breakDuration || 5 * 60;
    room.phase = 'focus';
    room.phaseStartTime = Date.now();

    // Clear any existing timer
    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
    }

    // Broadcast phase change to everyone
    io.to(roomCode).emit('phase_change', {
      phase: 'focus',
      phaseStartTime: room.phaseStartTime,
      focusDuration: room.focusDuration,
      breakDuration: room.breakDuration,
    });

    // Schedule end of focus phase
    room.phaseTimer = setTimeout(() => advancePhase(roomCode), room.focusDuration * 1000);
    console.log(`[${roomCode}] Session started: ${Math.round(room.focusDuration / 60)}m focus, ${Math.round(room.breakDuration / 60)}m break`);
  });

  // stop_session: roomCode
  socket.on('stop_session', (roomCode) => {
    const room = getRoom(roomCode);
    if (!room) return;

    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
      room.phaseTimer = null;
    }

    room.phase = 'waiting';
    room.phaseStartTime = null;

    io.to(roomCode).emit('phase_change', {
      phase: 'waiting',
      phaseStartTime: null,
      focusDuration: room.focusDuration,
      breakDuration: room.breakDuration,
    });
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    const roomCode = socketToRoom[socket.id];
    if (roomCode) {
      leaveRoom(socket, roomCode);
    }
  });
});

function leaveRoom(socket, roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;

  delete room.players[socket.id];
  delete socketToRoom[socket.id];
  socket.leave(roomCode);

  const playerCount = Object.keys(room.players).length;
  console.log(`[${roomCode}] ${socket.id} left (${playerCount} remaining)`);

  // Notify remaining players
  io.to(roomCode).emit('player_left', { playerId: socket.id });

  // If fewer than 2 players, pause the session
  if (playerCount < 2 && room.phase !== 'waiting') {
    if (room.phaseTimer) {
      clearTimeout(room.phaseTimer);
      room.phaseTimer = null;
    }
    room.phase = 'waiting';
    room.phaseStartTime = null;

    io.to(roomCode).emit('phase_change', {
      phase: 'waiting',
      phaseStartTime: null,
      focusDuration: room.focusDuration,
      breakDuration: room.breakDuration,
    });
  }

  // Clean up empty rooms
  if (playerCount === 0) {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    delete rooms[roomCode];
    console.log(`[${roomCode}] Room deleted`);
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origin: ${allowedOrigin}`);
});
