const express = require('express');
const http = require('http');
const { randomUUID } = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

if (!supabase) {
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_KEY not set — session recording disabled');
}

const app = express();
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: allowedOrigin }));
app.get('/health', (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigin, methods: ['GET', 'POST'] }
});

// sessions[sessionId] = {
//   phase, focusDuration, breakDuration, phaseStartTime, phaseTimer,
//   world, hostId (socketId), soloAllowed,
//   players: { [socketId]: { avatar, displayName, userId } }
// }
const sessions = {};
const socketToSession = {};

function getSession(sessionId) {
  return sessions[sessionId];
}

function buildSyncPayload(session) {
  return {
    phase: session.phase,
    focusDuration: session.focusDuration,
    breakDuration: session.breakDuration,
    phaseStartTime: session.phaseStartTime,
    world: session.world,
    players: session.players,
    playerCount: Object.keys(session.players).length,
    sessionId: session.id,
  };
}

// ── Supabase Presence Helpers ──────────────────────────────────────────────

async function setPresence(userId, sessionId, worldId) {
  if (!supabase || !userId) return;
  await supabase
    .from('profiles')
    .update({ current_session_id: sessionId, current_world_id: worldId, current_room: sessionId })
    .eq('id', userId)
    .then(() => {});
}

async function clearPresence(userId) {
  if (!supabase || !userId) return;
  await supabase
    .from('profiles')
    .update({ current_session_id: null, current_world_id: null, current_room: null })
    .eq('id', userId)
    .then(() => {});
}

// ── Session Recording ──────────────────────────────────────────────────────

async function recordSession(sessionId, session, completed) {
  if (!supabase) return;

  const elapsed = session.phaseStartTime
    ? Math.round((Date.now() - session.phaseStartTime) / 1000)
    : 0;
  const actualFocus = completed ? session.focusDuration : Math.min(elapsed, session.focusDuration);

  const userIds = Object.values(session.players)
    .map(p => p.userId)
    .filter(Boolean);

  if (userIds.length === 0) return;

  try {
    const { data: row, error } = await supabase
      .from('sessions')
      .insert({
        room_code: sessionId,
        world: session.world,
        focus_duration: session.focusDuration,
        break_duration: session.breakDuration,
        actual_focus: actualFocus,
        completed,
        started_at: new Date(session.phaseStartTime).toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error(`[${sessionId}] Failed to record session:`, error.message);
      return;
    }

    const { error: pError } = await supabase
      .from('session_participants')
      .insert(userIds.map(uid => ({ session_id: row.id, user_id: uid })));

    if (pError) {
      console.error(`[${sessionId}] Failed to record participants:`, pError.message);
    } else {
      console.log(`[${sessionId}] Session recorded: ${actualFocus}s, ${completed ? 'completed' : 'stopped early'}, ${userIds.length} participants`);
    }
  } catch (err) {
    console.error(`[${sessionId}] Session recording error:`, err);
  }
}

// ── Phase Advance ──────────────────────────────────────────────────────────

function advancePhase(sessionId) {
  const session = getSession(sessionId);
  if (!session) return;

  if (session.phaseTimer) {
    clearTimeout(session.phaseTimer);
    session.phaseTimer = null;
  }

  const CELEBRATION_MS = 4000;
  const RETURNING_MS = 3500;

  let nextPhase;
  let delay;

  switch (session.phase) {
    case 'focus':
      nextPhase = 'celebration';
      delay = CELEBRATION_MS;
      recordSession(sessionId, session, true);
      break;
    case 'celebration':
      nextPhase = 'break';
      delay = session.breakDuration * 1000;
      break;
    case 'break':
      nextPhase = 'returning';
      delay = RETURNING_MS;
      break;
    case 'returning':
      nextPhase = 'focus';
      delay = session.focusDuration * 1000;
      break;
    default:
      return;
  }

  session.phase = nextPhase;
  session.phaseStartTime = Date.now();

  io.to(sessionId).emit('phase_change', {
    phase: nextPhase,
    phaseStartTime: session.phaseStartTime,
    focusDuration: session.focusDuration,
    breakDuration: session.breakDuration,
  });

  console.log(`[${sessionId}] Phase: ${nextPhase}`);
  session.phaseTimer = setTimeout(() => advancePhase(sessionId), delay);
}

// ── Leave Session Helper ───────────────────────────────────────────────────

function leaveSession(socket, sessionId) {
  const session = getSession(sessionId);
  if (!session) return;

  const player = session.players[socket.id];
  if (player?.userId) clearPresence(player.userId);

  delete session.players[socket.id];
  delete socketToSession[socket.id];
  socket.leave(sessionId);

  const playerCount = Object.keys(session.players).length;
  console.log(`[${sessionId}] ${socket.id} left (${playerCount} remaining)`);

  io.to(sessionId).emit('player_left', { playerId: socket.id });

  if (playerCount === 0) {
    if (session.phase === 'focus') recordSession(sessionId, session, false);
    if (session.phaseTimer) clearTimeout(session.phaseTimer);
    delete sessions[sessionId];
    console.log(`[${sessionId}] Session deleted`);
    return;
  }

  // Solo session keeps running, multi-player pauses if only 1 left and not solo-allowed
  if (playerCount < 1 && session.phase !== 'waiting') {
    if (session.phase === 'focus') recordSession(sessionId, session, false);
    if (session.phaseTimer) {
      clearTimeout(session.phaseTimer);
      session.phaseTimer = null;
    }
    session.phase = 'waiting';
    session.phaseStartTime = null;
    io.to(sessionId).emit('phase_change', {
      phase: 'waiting',
      phaseStartTime: null,
      focusDuration: session.focusDuration,
      breakDuration: session.breakDuration,
    });
  }
}

// ── Socket Handlers ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // create_session: { avatar, world, displayName, userId }
  // Creates a new session with a UUID, user becomes host.
  socket.on('create_session', ({ avatar, world, displayName, userId }) => {
    const prevSession = socketToSession[socket.id];
    if (prevSession) leaveSession(socket, prevSession);

    const sessionId = randomUUID();

    sessions[sessionId] = {
      id: sessionId,
      phase: 'waiting',
      focusDuration: 25 * 60,
      breakDuration: 5 * 60,
      phaseStartTime: null,
      phaseTimer: null,
      world: world || 'forest',
      hostId: socket.id,
      players: {},
    };

    socket.join(sessionId);
    socketToSession[socket.id] = sessionId;
    sessions[sessionId].players[socket.id] = {
      avatar,
      displayName: displayName || 'Player',
      userId: userId || null,
    };

    if (userId) setPresence(userId, sessionId, world || 'forest');

    console.log(`[${sessionId}] ${displayName || socket.id} created session (world: ${world || 'forest'})`);

    socket.emit('session_created', { sessionId });
    socket.emit('sync_state', buildSyncPayload(sessions[sessionId]));
  });

  // join_session: { sessionId, avatar, displayName, userId }
  // Joins an existing session by its UUID.
  socket.on('join_session', ({ sessionId, avatar, displayName, userId }) => {
    const prevSession = socketToSession[socket.id];
    if (prevSession && prevSession !== sessionId) leaveSession(socket, prevSession);

    const session = getSession(sessionId);
    if (!session) {
      socket.emit('session_error', { message: 'Session not found' });
      return;
    }

    socket.join(sessionId);
    socketToSession[socket.id] = sessionId;
    session.players[socket.id] = {
      avatar,
      displayName: displayName || 'Player',
      userId: userId || null,
    };

    if (userId) setPresence(userId, sessionId, session.world);

    const playerCount = Object.keys(session.players).length;
    console.log(`[${sessionId}] ${displayName || socket.id} joined (${playerCount} players)`);

    socket.to(sessionId).emit('player_joined', {
      playerId: socket.id,
      avatar,
      displayName: displayName || 'Player',
    });

    socket.emit('sync_state', buildSyncPayload(session));
  });

  // start_session: { sessionId, focusDuration, breakDuration }
  // Solo start allowed (1 player is fine).
  socket.on('start_session', ({ sessionId, focusDuration, breakDuration }) => {
    const session = getSession(sessionId);
    if (!session) return;
    if (Object.keys(session.players).length < 1) return;

    session.focusDuration = focusDuration || 25 * 60;
    session.breakDuration = breakDuration || 5 * 60;
    session.phase = 'focus';
    session.phaseStartTime = Date.now();

    if (session.phaseTimer) clearTimeout(session.phaseTimer);

    io.to(sessionId).emit('phase_change', {
      phase: 'focus',
      phaseStartTime: session.phaseStartTime,
      focusDuration: session.focusDuration,
      breakDuration: session.breakDuration,
    });

    session.phaseTimer = setTimeout(() => advancePhase(sessionId), session.focusDuration * 1000);
    console.log(`[${sessionId}] Session started: ${Math.round(session.focusDuration / 60)}m focus, ${Math.round(session.breakDuration / 60)}m break, ${Object.keys(session.players).length} players`);
  });

  // stop_session: { sessionId }
  socket.on('stop_session', ({ sessionId }) => {
    const session = getSession(sessionId);
    if (!session) return;

    if (session.phase === 'focus') recordSession(sessionId, session, false);

    if (session.phaseTimer) {
      clearTimeout(session.phaseTimer);
      session.phaseTimer = null;
    }

    session.phase = 'waiting';
    session.phaseStartTime = null;

    io.to(sessionId).emit('phase_change', {
      phase: 'waiting',
      phaseStartTime: null,
      focusDuration: session.focusDuration,
      breakDuration: session.breakDuration,
    });
  });

  // leave_session: { sessionId }
  socket.on('leave_session', ({ sessionId }) => {
    leaveSession(socket, sessionId);
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    const sessionId = socketToSession[socket.id];
    if (sessionId) leaveSession(socket, sessionId);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origin: ${allowedOrigin}`);
});
