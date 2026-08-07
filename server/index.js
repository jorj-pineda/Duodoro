const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const {
  createSessionState,
  addPlayer,
  removePlayer,
  setPlayerPet,
  findPlayerByUserId,
  markPlayerDisconnected,
  sessionParticipantIds,
  buildSyncPayload,
} = require('./session');
require('dotenv').config();

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

if (!supabase) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY are required in production');
    process.exit(1);
  }
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_KEY not set — running in dev mode (no auth, no persistence)');
}

const app = express();
// Comma-separated list, e.g. "https://duodoro.live,https://duodoro.vercel.app"
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(helmet());
app.get('/', (_, res) => res.json({ status: 'Duodoro server running', ok: true }));
app.get('/health', (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5, // 100KB max payload
});

// ── Auth middleware — verify Supabase JWT on every connection ─────────────
const VALID_WORLDS = ['forest', 'space', 'beach', 'city', 'mountain', 'library', 'cafe', 'lofi'];
const MAX_DISPLAY_NAME = 50;
const MAX_FOCUS = 120 * 60;   // 2 hours in seconds
const MAX_BREAK = 60 * 60;    // 1 hour in seconds

const VALID_HAIR_STYLES = ['bob', 'mohawk', 'long', 'spiky', 'bald'];
const VALID_EYE_STYLES = ['normal', 'anime', 'sleepy'];
const VALID_PETS = ['cat', 'dog', 'dragon', 'rabbit'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function sanitizePet(pet) {
  return VALID_PETS.includes(pet) ? pet : null;
}

function sanitizeAvatar(avatar) {
  if (!avatar || typeof avatar !== 'object') return null;
  const { skinColor, hairStyle, hairColor, eyeStyle, outfitColor } = avatar;
  if (!HEX_COLOR.test(skinColor) || !HEX_COLOR.test(hairColor) || !HEX_COLOR.test(outfitColor)) return null;
  if (!VALID_HAIR_STYLES.includes(hairStyle) || !VALID_EYE_STYLES.includes(eyeStyle)) return null;
  return { skinColor, hairStyle, hairColor, eyeStyle, outfitColor };
}

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  if (!supabase) {
    // If Supabase isn't configured, skip JWT verification (dev mode) — but
    // still decode the unverified sub claim so userId-keyed features
    // (presence, reconnect grace) behave like production locally
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      if (typeof payload?.sub === 'string') socket.userId = payload.sub;
    } catch { /* not a JWT — stay anonymous */ }
    console.warn('[auth] Supabase not configured, skipping JWT verification');
    return next();
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return next(new Error('Invalid or expired token'));
    }
    socket.userId = user.id;
    next();
  } catch (err) {
    return next(new Error('Authentication failed'));
  }
});

// sessions[sessionId] = {
//   phase, focusDuration, breakDuration, phaseStartTime, phaseTimer,
//   world, hostId (socketId),
//   players: { [socketId]: { avatar, displayName, userId, pet } }
// }
const sessions = {};
const socketToSession = {};

// Presence: track which users have the app open (userId <-> socketId)
const userSockets = new Map();   // userId  -> socket.id
const socketToUser = new Map();  // socket.id -> userId

// ── Simple per-socket rate limiter ───────────────────────────────────────────
function createRateLimiter(maxPerWindow, windowMs) {
  const counters = new Map(); // socketId -> { count, resetAt }
  const check = (socketId) => {
    const now = Date.now();
    const entry = counters.get(socketId);
    if (!entry || now > entry.resetAt) {
      counters.set(socketId, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= maxPerWindow;
  };
  check.clear = (socketId) => counters.delete(socketId);
  return check;
}

const rateLimits = {
  createSession: createRateLimiter(5, 60_000),   // 5 per minute
  joinSession:   createRateLimiter(10, 60_000),   // 10 per minute
  sendInvite:    createRateLimiter(10, 60_000),   // 10 per minute
};

function getSession(sessionId) {
  return sessions[sessionId];
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

// ── Presence Helpers ──────────────────────────────────────────────────────

async function getFriendIds(userId) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (!data) return [];
  return data.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
}

function broadcastPresence(userId, online) {
  getFriendIds(userId).then(friendIds => {
    for (const fid of friendIds) {
      const fSocketId = userSockets.get(fid);
      if (fSocketId) {
        io.to(fSocketId).emit('presence_update', { userId, online });
      }
    }
  });
}

// ── Session Recording ──────────────────────────────────────────────────────

// participantIds lets callers pass a snapshot taken *before* they mutate
// session.players — the abandoned-session path records the last player leaving,
// by which point they're already gone from the live map.
async function recordSession(sessionId, session, completed, participantIds) {
  if (!supabase) return;

  const elapsed = session.phaseStartTime
    ? Math.round((Date.now() - session.phaseStartTime) / 1000)
    : 0;
  const actualFocus = completed ? session.focusDuration : Math.min(elapsed, session.focusDuration);

  const userIds = participantIds ?? sessionParticipantIds(session);

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
    mode: session.mode,
    phase: nextPhase,
    phaseStartTime: session.phaseStartTime,
    focusDuration: session.focusDuration,
    breakDuration: session.breakDuration,
  });

  console.log(`[${sessionId}] Phase: ${nextPhase}`);
  session.phaseTimer = setTimeout(() => advancePhase(sessionId), delay);
}

// ── Leave Session / Reconnect Grace ────────────────────────────────────────

// A dropped socket doesn't eject the player immediately: authenticated players
// get a grace window to reconnect (tab refresh, flaky Wi-Fi, mobile tab sleep)
// before their spot — and a solo session's timer — is torn down.
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 60_000;

// Keyed by the *dropped socket id*, not userId. socketToSession is per-socket,
// so a second tab joins a second session without leaving the first, and one
// user can legitimately hold a slot in two sessions. Keying by userId would let
// the second drop cancel the first one's timer, orphaning a player slot whose
// session then never gets deleted — its phase chain runs forever, re-recording
// completed focus on every cycle. Per-socket timers finalize independently.
const pendingDisconnects = new Map(); // socketId -> timer

function cancelPendingDisconnect(socketId) {
  const timer = pendingDisconnects.get(socketId);
  if (!timer) return;
  clearTimeout(timer);
  pendingDisconnects.delete(socketId);
}

function finalizePlayerRemoval(sessionId, socketId) {
  const session = getSession(sessionId);
  if (!session || !session.players[socketId]) return;

  const player = session.players[socketId];
  if (player.userId) clearPresence(player.userId);

  // Snapshot participants before the removal — if this is the last player, the
  // abandoned-focus record below still needs to know who was in the session.
  const participantIds = sessionParticipantIds(session);

  const playerCount = removePlayer(session, socketId);
  console.log(`[${sessionId}] ${socketId} left (${playerCount} remaining)`);

  io.to(sessionId).emit('player_left', { playerId: socketId });

  if (playerCount === 0) {
    if (session.phase === 'focus') recordSession(sessionId, session, false, participantIds);
    if (session.phaseTimer) clearTimeout(session.phaseTimer);
    delete sessions[sessionId];
    console.log(`[${sessionId}] Session deleted`);
  }
  // If players remain, the session keeps running for them (solo continuation
  // is intentional — sessions can also be started solo).
}

function leaveSession(socket, sessionId) {
  cancelPendingDisconnect(socket.id);
  delete socketToSession[socket.id];
  socket.leave(sessionId);
  finalizePlayerRemoval(sessionId, socket.id);
}

// ── Socket Handlers ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // ── Presence registration ───────────────────────────────────────────────
  // Use verified socket.userId from auth middleware instead of client-sent userId
  socket.on('register_user', () => {
    const userId = socket.userId;
    if (!userId) return;
    // If this user already has a socket, clean up the old one
    const oldSocketId = userSockets.get(userId);
    if (oldSocketId && oldSocketId !== socket.id) {
      socketToUser.delete(oldSocketId);
    }
    userSockets.set(userId, socket.id);
    socketToUser.set(socket.id, userId);
    broadcastPresence(userId, true);
    console.log(`[presence] ${userId} registered (${socket.id})`);
  });

  socket.on('get_online_friends', async ({ friendIds }, callback) => {
    if (typeof callback !== 'function') return;
    const userId = socket.userId;
    if (!userId) { callback([]); return; }

    // Validate that queried IDs are actual accepted friends
    const actualFriendIds = await getFriendIds(userId);
    const friendSet = new Set(actualFriendIds);
    const validIds = (friendIds || []).filter(id => friendSet.has(id));
    const online = validIds.filter(id => userSockets.has(id));
    callback(online);
  });

  // ── Invite relay ────────────────────────────────────────────────────────
  socket.on('send_invite', ({ targetUserId, sessionId, worldId, fromName }) => {
    if (!rateLimits.sendInvite(socket.id)) {
      socket.emit('invite_error', { message: 'Too many invites, slow down' });
      return;
    }
    if (typeof targetUserId !== 'string' || !targetUserId) return;
    // Verify sender is actually in the session they're inviting to
    if (sessionId && sessions[sessionId] && !sessions[sessionId].players[socket.id]) {
      socket.emit('invite_error', { message: 'You are not in this session' });
      return;
    }
    const targetSocketId = userSockets.get(targetUserId);
    if (!targetSocketId) {
      socket.emit('invite_error', { message: 'Friend is offline' });
      return;
    }
    // Use verified userId, not client-sent
    const fromUserId = socket.userId || null;
    const safeName = (typeof fromName === 'string' ? fromName : 'Someone').slice(0, MAX_DISPLAY_NAME);
    const safeWorld = VALID_WORLDS.includes(worldId) ? worldId : null;
    io.to(targetSocketId).emit('session_invite', {
      sessionId: typeof sessionId === 'string' ? sessionId : null,
      worldId: safeWorld,
      fromName: safeName,
      fromUserId,
    });
    console.log(`[invite] ${safeName} invited ${targetUserId}`);
  });

  // create_session: { avatar, world, displayName, pet }
  // Creates a new session with a UUID, user becomes host.
  // userId comes from verified socket.userId (auth middleware).
  socket.on('create_session', ({ avatar, world, displayName, pet }) => {
    if (!rateLimits.createSession(socket.id)) {
      socket.emit('session_error', { message: 'Too many requests, slow down' });
      return;
    }
    // Input validation
    const safeName = (typeof displayName === 'string' ? displayName : 'Player').slice(0, MAX_DISPLAY_NAME);
    const safeWorld = VALID_WORLDS.includes(world) ? world : 'forest';
    const safeAvatar = sanitizeAvatar(avatar);
    if (!safeAvatar) {
      socket.emit('session_error', { message: 'Invalid avatar' });
      return;
    }

    const prevSession = socketToSession[socket.id];
    if (prevSession) leaveSession(socket, prevSession);

    const userId = socket.userId || null;

    const session = createSessionState(safeWorld, socket.id);
    const sessionId = session.id;
    sessions[sessionId] = session;

    socket.join(sessionId);
    socketToSession[socket.id] = sessionId;
    addPlayer(session, socket.id, {
      avatar: safeAvatar,
      displayName: safeName,
      userId,
      pet: sanitizePet(pet),
    });

    if (userId) setPresence(userId, sessionId, safeWorld);

    console.log(`[${sessionId}] ${safeName} created session (world: ${safeWorld})`);

    socket.emit('session_created', { sessionId });
    socket.emit('sync_state', buildSyncPayload(session));
  });

  // join_session: { sessionId, avatar, displayName, pet }
  // Joins an existing session by its UUID.
  // userId comes from verified socket.userId (auth middleware).
  socket.on('join_session', ({ sessionId, avatar, displayName, pet }) => {
    if (!rateLimits.joinSession(socket.id)) {
      socket.emit('session_error', { message: 'Too many requests, slow down' });
      return;
    }
    const safeName = (typeof displayName === 'string' ? displayName : 'Player').slice(0, MAX_DISPLAY_NAME);
    const safeAvatar = sanitizeAvatar(avatar);
    if (!safeAvatar) {
      socket.emit('session_error', { message: 'Invalid avatar' });
      return;
    }
    if (typeof sessionId !== 'string') {
      socket.emit('session_error', { message: 'Invalid session ID' });
      return;
    }

    const prevSession = socketToSession[socket.id];
    if (prevSession && prevSession !== sessionId) leaveSession(socket, prevSession);

    const session = getSession(sessionId);
    if (!session) {
      socket.emit('session_error', { message: 'Session not found' });
      return;
    }

    const userId = socket.userId || null;

    // Reconnect: this user already has a player slot in the session under an
    // old socket id (grace-pending, or a zombie socket the server hasn't
    // noticed dropping yet). Evict the old entry so the join below re-keys
    // them instead of duplicating the player.
    const oldSocketId = userId ? findPlayerByUserId(session, userId) : null;
    if (oldSocketId && oldSocketId !== socket.id) {
      cancelPendingDisconnect(oldSocketId);
      removePlayer(session, oldSocketId);
      delete socketToSession[oldSocketId];
      // Stop broadcasting to a socket that's no longer a player (a still-open
      // stale tab); harmless no-op when the old socket is already gone.
      io.sockets.sockets.get(oldSocketId)?.leave(sessionId);
      if (session.hostId === oldSocketId) session.hostId = socket.id;
      socket.to(sessionId).emit('player_left', { playerId: oldSocketId });
      console.log(`[${sessionId}] ${userId} reconnected (${oldSocketId} → ${socket.id})`);
    }

    const safePet = sanitizePet(pet);
    socket.join(sessionId);
    socketToSession[socket.id] = sessionId;
    const playerCount = addPlayer(session, socket.id, {
      avatar: safeAvatar,
      displayName: safeName,
      userId,
      pet: safePet,
    });

    if (userId) setPresence(userId, sessionId, session.world);
    console.log(`[${sessionId}] ${safeName} joined (${playerCount} players)`);

    socket.to(sessionId).emit('player_joined', {
      playerId: socket.id,
      avatar: safeAvatar,
      displayName: safeName,
      pet: safePet,
    });

    socket.emit('sync_state', buildSyncPayload(session));
  });

  // start_session: { sessionId, focusDuration, breakDuration, mode }
  // Solo start allowed (1 player is fine).
  socket.on('start_session', ({ sessionId, focusDuration, breakDuration, mode }) => {
    const session = getSession(sessionId);
    if (!session) return;
    if (Object.keys(session.players).length < 1) return;
    // Only a player in this session can start it
    if (!session.players[socket.id]) return;
    // Only from the waiting room. Without this, a duplicate/racing start
    // silently restarts a running focus phase — resetting phaseStartTime and
    // discarding the elapsed time instead of recording it.
    if (session.phase !== 'waiting') return;

    const safeFocus = Math.min(Math.max(Number(focusDuration) || 25 * 60, 60), MAX_FOCUS);
    const safeBreak = Math.min(Math.max(Number(breakDuration) || 5 * 60, 30), MAX_BREAK);

    const safeMode = mode === 'flow' ? 'flow' : 'pomodoro';
    session.mode = safeMode;

    if (safeMode === 'flow') {
      session.focusDuration = MAX_FOCUS; // safety cap for server
      session.breakDuration = MAX_BREAK;
    } else {
      session.focusDuration = safeFocus;
      session.breakDuration = safeBreak;
    }

    session.phase = 'focus';
    session.phaseStartTime = Date.now();

    if (session.phaseTimer) clearTimeout(session.phaseTimer);

    io.to(sessionId).emit('phase_change', {
      mode: session.mode,
      phase: 'focus',
      phaseStartTime: session.phaseStartTime,
      focusDuration: session.focusDuration,
      breakDuration: session.breakDuration,
    });

    if (safeMode === 'pomodoro') {
      session.phaseTimer = setTimeout(() => advancePhase(sessionId), session.focusDuration * 1000);
    }
    console.log(`[${sessionId}] Session started: mode ${safeMode}, ${Math.round(session.focusDuration / 60)}m focus, ${Math.round(session.breakDuration / 60)}m break, ${Object.keys(session.players).length} players`);
  });

  // finish_flow_focus: { sessionId }
  socket.on('finish_flow_focus', ({ sessionId }) => {
    const session = getSession(sessionId);
    if (!session) return;
    if (session.mode !== 'flow' || session.phase !== 'focus') return;
    if (!session.players[socket.id]) return; // Only participants can trigger

    // Calculate actual elapsed focus time in seconds
    const elapsedSeconds = Math.round((Date.now() - session.phaseStartTime) / 1000);
    // Limit elapsed time to MAX_FOCUS
    const effectiveFocus = Math.min(elapsedSeconds, session.focusDuration);

    // Save accurate duration for records before advancing
    session.focusDuration = effectiveFocus;
    // Calculate break: ~1/5 of focus time, min 60s, max MAX_BREAK
    session.breakDuration = Math.min(Math.max(60, Math.round(effectiveFocus / 5)), MAX_BREAK);

    // This logs the 'true' completion, since manual triggers are the proper way to end flow mode
    advancePhase(sessionId);
  });

  // stop_session: { sessionId }
  socket.on('stop_session', ({ sessionId }) => {
    const session = getSession(sessionId);
    if (!session) return;
    if (!session.players[socket.id]) return; // Only participants can stop

    if (session.phase === 'focus') recordSession(sessionId, session, false);

    if (session.phaseTimer) {
      clearTimeout(session.phaseTimer);
      session.phaseTimer = null;
    }

    session.phase = 'waiting';
    session.phaseStartTime = null;

    io.to(sessionId).emit('phase_change', {
      mode: session.mode,
      phase: 'waiting',
      phaseStartTime: null,
      focusDuration: session.focusDuration,
      breakDuration: session.breakDuration,
    });
  });

  // set_pet: { sessionId, pet }
  // Change your pet mid-session; relayed to the other player.
  socket.on('set_pet', ({ sessionId, pet }) => {
    const session = getSession(sessionId);
    if (!session) return;
    if (!session.players[socket.id]) return; // Only participants
    const safePet = sanitizePet(pet);
    setPlayerPet(session, socket.id, safePet);
    socket.to(sessionId).emit('pet_changed', { playerId: socket.id, pet: safePet });
  });

  // leave_session: { sessionId }
  socket.on('leave_session', ({ sessionId }) => {
    leaveSession(socket, sessionId);
  });

  // request_sync: no payload
  // Client-initiated resync after tab wake / network hiccup. Emits current
  // session state if this socket is still tracked in a session; silent no-op
  // otherwise (client treats absence of sync_state as "no session").
  socket.on('request_sync', () => {
    const sessionId = socketToSession[socket.id];
    if (!sessionId) return;
    const session = getSession(sessionId);
    if (!session) return;
    socket.emit('sync_state', buildSyncPayload(session));
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    const sessionId = socketToSession[socket.id];
    if (sessionId) {
      delete socketToSession[socket.id];
      const session = getSession(sessionId);
      const player = session?.players[socket.id];
      if (session && player?.userId) {
        // Grace window: keep the player's slot (and a solo session's timer)
        // alive so a reconnect can resume instead of losing the pomodoro.
        markPlayerDisconnected(session, socket.id, true);
        const timer = setTimeout(() => {
          pendingDisconnects.delete(socket.id);
          finalizePlayerRemoval(sessionId, socket.id);
        }, RECONNECT_GRACE_MS);
        pendingDisconnects.set(socket.id, timer);
        io.to(sessionId).emit('player_disconnected', { playerId: socket.id });
        console.log(`[${sessionId}] ${socket.id} dropped — ${RECONNECT_GRACE_MS / 1000}s reconnect grace`);
      } else if (session) {
        // Unauthenticated (dev mode) players can't be matched on reconnect
        finalizePlayerRemoval(sessionId, socket.id);
      }
    }

    // Drop this socket's rate-limit counters — they'd otherwise accumulate forever
    Object.values(rateLimits).forEach((limiter) => limiter.clear(socket.id));

    // Clean up presence
    const userId = socketToUser.get(socket.id);
    if (userId) {
      userSockets.delete(userId);
      socketToUser.delete(socket.id);
      broadcastPresence(userId, false);
      console.log(`[presence] ${userId} disconnected`);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});
