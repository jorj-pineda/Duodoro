const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const { createPresenceRegistry } = require('./presence');
const {
  createSessionState,
  createShareInvite,
  findSessionByShareInvite,
  consumeShareInvite,
  beginFocusRound,
  addPlayer,
  removePlayer,
  setPlayerPet,
  creditFocusRound,
  inviteUser,
  isInvited,
  findPlayerByUserId,
  reservePlayerSlot,
  releasePlayerSlot,
  hasOpenPlayerSlot,
  markPlayerDisconnected,
  sessionParticipantIds,
  findUserSessions,
  buildSyncPayload,
} = require('./session');
const { worldAt } = require('./rotation');
const { petStageAt, GROWN_AT_SECONDS } = require('./petLevel');
const { fetchTotalFocusSeconds } = require('./focusTotal');
const { recordFocusSession } = require('./focusRecorder');
const { deleteAccountData } = require('./accountDeletion');
const { isPayloadObject, safeSocketHandler } = require('./socketProtocol');
const {
  correlationRef,
  createLogger,
  createMetrics,
  createRpcObserver,
  safeErrorFields,
} = require('./observability');
const { createReadinessChecker } = require('./readiness');
require('dotenv').config({ quiet: true });

const logger = createLogger();
const metrics = createMetrics({ logger });
const observeRpc = createRpcObserver({ logger, metrics });

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

if (!supabase) {
  if (process.env.NODE_ENV === 'production') {
    logger.error('configuration_invalid', { dependency: 'supabase' });
    process.exit(1);
  }
  logger.warn('persistence_disabled', { mode: 'development' });
}

const checkReadiness = createReadinessChecker(supabase, {
  observe: ({ outcome, durationMs, error }) => {
    metrics.increment(`database_readiness_${outcome}_total`);
    metrics.observeDuration('database_readiness_duration_ms', durationMs);
    const fields = {
      dependency: 'database',
      outcome,
      duration_ms: Math.max(0, Math.round(durationMs)),
      ...safeErrorFields(error),
    };
    logger[outcome === 'success' ? 'info' : 'error'](
      'database_readiness_probe',
      fields,
    );
  },
});

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
app.get('/ready', async (_, res) => {
  const result = await checkReadiness();
  res.status(result.ok ? 200 : 503).json(result);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e5, // 100KB max payload
});

// ── Auth middleware — verify Supabase JWT on every connection ─────────────
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

// Completed focus seconds for one user, the input to petStageAt(). The read
// itself lives in ./focusTotal so it can be faked in a test; a failed read
// returns null so the caller can keep the current look (grown) rather than
// shrinking everyone to young — a zero and a failure must not render the
// same way.
function totalFocusSeconds(userId) {
  return fetchTotalFocusSeconds(supabase, userId, { observe: observeRpc });
}

function stageForTotal(seconds) {
  // A failed fetch is not 0 hours. Leave the pet at today's size rather
  // than pretending the user is new.
  if (seconds === null) return 'grown';
  return petStageAt(seconds);
}

// Keep the cached total consistent with stageForTotal: a failed fetch
// must not later recompute as young when the user picks a different pet.
function cachedFocus(seconds) {
  return seconds === null ? GROWN_AT_SECONDS : seconds;
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
    logger.warn('authentication_skipped', { mode: 'development' });
    return next();
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return next(new Error('Invalid or expired token'));
    }
    socket.userId = user.id;
    socket.userEmail = user.email || null;
    next();
  } catch (err) {
    return next(new Error('Authentication failed'));
  }
});

// sessions[sessionId] = {
//   phase, focusDuration, breakDuration, phaseStartTime, phaseTimer,
//   world, hostId (socketId),
//   players: { [socketId]: { avatar, displayName, userId, pet, petStage } }
// }
const sessions = {};
const socketToSession = {};

// Presence: which users have the app open. Keyed by user with a set of
// sockets, so extra tabs don't evict each other — see presence.js.
const presence = createPresenceRegistry();

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
  shareInvite:   createRateLimiter(10, 60_000),   // 10 per minute
};

// Register a client-originated event behind one runtime boundary. Socket.IO
// clients are not limited to this repository's TypeScript shapes: they can
// send null, arrays, primitives, or malformed objects. Check the container
// before a handler reads a field, and contain both synchronous exceptions and
// rejected promises so one bad client event cannot take down the process.
function onPayload(socket, event, handler, options = {}) {
  const {
    errorEvent = 'session_error',
    invalidMessage = 'Invalid request',
    onInvalid = null,
  } = options;

  const reportError = (error) => {
    metrics.increment('protocol_handler_failures_total');
    logger.error('protocol_handler_failed', {
      protocol_event: event,
      socket_ref: correlationRef('socket', socket.id),
      ...safeErrorFields(error),
    });
    if (errorEvent) socket.emit(errorEvent, { message: 'Request failed' });
  };

  socket.on(event, safeSocketHandler((payload, ...args) => {
    if (!isPayloadObject(payload)) {
      metrics.increment('protocol_payload_rejections_total');
      logger.warn('protocol_payload_rejected', {
        protocol_event: event,
        socket_ref: correlationRef('socket', socket.id),
        reason: 'non_object',
      });
      if (onInvalid) onInvalid(...args);
      else if (errorEvent) socket.emit(errorEvent, { message: invalidMessage });
      return;
    }
    return handler(payload, ...args);
  }, reportError));
}

function getSession(sessionId) {
  return sessions[sessionId];
}

// ── Supabase Presence Helpers ──────────────────────────────────────────────

async function setPresence(userId, sessionId, worldId) {
  if (!supabase || !userId) return;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ current_session_id: sessionId, current_world_id: worldId, current_room: sessionId })
      .eq('id', userId);
    if (!error) return;
    throw error;
  } catch (error) {
    metrics.increment('presence_write_failures_total');
    logger.warn('presence_write_failed', {
      operation: 'set',
      account_ref: correlationRef('account', userId),
      room_ref: correlationRef('room', sessionId),
      ...safeErrorFields(error),
    });
  }
}

async function clearPresence(userId) {
  if (!supabase || !userId) return;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ current_session_id: null, current_world_id: null, current_room: null })
      .eq('id', userId);
    if (!error) return;
    throw error;
  } catch (error) {
    metrics.increment('presence_write_failures_total');
    logger.warn('presence_write_failed', {
      operation: 'clear',
      account_ref: correlationRef('account', userId),
      ...safeErrorFields(error),
    });
  }
}

// ── Presence Helpers ──────────────────────────────────────────────────────

async function getFriendIds(userId) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) throw error;
    if (!data) return [];
    return data.map(f => f.requester_id === userId ? f.addressee_id : f.requester_id);
  } catch (error) {
    metrics.increment('friend_read_failures_total');
    logger.warn('friend_read_failed', {
      account_ref: correlationRef('account', userId),
      ...safeErrorFields(error),
    });
    return [];
  }
}

// Dev mode (no Supabase) has no friendship data at all; treat everyone as
// friends there so local development isn't blocked by an unanswerable check.
async function areFriends(userId, otherUserId) {
  if (!supabase) return true;
  if (!userId || !otherUserId) return false;
  if (userId === otherUserId) return true;
  const friendIds = await getFriendIds(userId);
  return friendIds.includes(otherUserId);
}

// Knowing a session UUID must not be enough to walk into it. Session ids leak
// easily — profiles.current_session_id is readable by anyone the DB lets read
// the row, and ids travel through invites and client state.
async function canJoinSession(session, userId) {
  if (!supabase) return true;                            // dev mode, see areFriends
  if (!userId) return false;
  if (findPlayerByUserId(session, userId)) return true;  // reconnecting to own slot
  if (isInvited(session, userId)) return true;           // explicitly invited
  // Otherwise you must already know someone in there — this is what keeps the
  // "join" button on a friend's presence card working without an invite.
  const friendIds = new Set(await getFriendIds(userId));
  return sessionParticipantIds(session).some((id) => friendIds.has(id));
}

function broadcastPresence(userId, online) {
  getFriendIds(userId).then(friendIds => {
    for (const fid of friendIds) {
      // Every tab the friend has open, not just their most recent one
      for (const fSocketId of presence.socketsFor(fid)) {
        io.to(fSocketId).emit('presence_update', { userId, online });
      }
    }
  });
}

// ── Session Recording ──────────────────────────────────────────────────────

// Fire-and-forget phase transitions still need a handle during deployment.
// Shutdown drains this set before exiting, within the process-wide deadline.
const pendingRecordings = new Set();

// participantIds lets callers pass a snapshot taken *before* they mutate
// session.players — the abandoned-session path records the last player leaving,
// by which point they're already gone from the live map.
async function recordSession(sessionId, session, completed, participantIds) {
  if (!supabase) return;

  // Snapshot every input before the first await. The live session may advance,
  // restart, lose a player, or be deleted while the database request is in
  // flight; none of those changes may rewrite the event being persisted.
  const recordingKey = session.focusRoundId;
  const startedAt = session.phaseStartTime;
  const elapsed = startedAt
    ? Math.round((Date.now() - startedAt) / 1000)
    : 0;
  // In flow mode focusDuration is only a safety cap, never the real length —
  // the elapsed time is the actual focus, whether it completed or not.
  const actualFocus = (completed && session.mode !== 'flow')
    ? session.focusDuration
    : Math.max(0, Math.min(elapsed, session.focusDuration));

  const userIds = participantIds ?? sessionParticipantIds(session);

  if (userIds.length === 0) return;
  if (!recordingKey || !startedAt) {
    metrics.increment('focus_record_failures_total');
    logger.error('focus_record_rejected', {
      room_ref: correlationRef('room', sessionId),
      reason: 'missing_round_state',
    });
    return;
  }

  try {
    const result = await recordFocusSession(supabase, {
      p_recording_key: recordingKey,
      p_room_code: sessionId,
      p_world: session.world,
      p_focus_duration: session.focusDuration,
      p_break_duration: session.breakDuration,
      p_actual_focus: actualFocus,
      p_completed: completed,
      p_started_at: new Date(startedAt).toISOString(),
      p_user_ids: userIds,
    }, { observe: observeRpc });

    metrics.increment('focus_record_success_total');
    logger.info('focus_record_completed', {
      room_ref: correlationRef('room', sessionId),
      outcome: result.inserted ? 'inserted' : 'idempotent',
      actual_focus_seconds: actualFocus,
      completed,
      participant_count: userIds.length,
    });

    // Only completed rows feed get_focus_stats, so only those grow the pet.
    // Credit the in-memory total rather than re-querying: the row was just
    // written, and a replica lag would otherwise delay the growth by a round.
    // The round key makes this safe when a lost response turns a retry into
    // result.inserted=false even though the original write succeeded.
    if (completed && sessions[sessionId] === session) {
      for (const update of creditFocusRound(
        session,
        recordingKey,
        userIds,
        actualFocus,
      )) {
        io.to(sessionId).emit('pet_changed', update);
      }
    }
  } catch (err) {
    metrics.increment('focus_record_failures_total');
    logger.error('focus_record_failed', {
      room_ref: correlationRef('room', sessionId),
      ...safeErrorFields(err),
    });
  }
}

function queueSessionRecording(sessionId, session, completed, participantIds) {
  const pending = recordSession(sessionId, session, completed, participantIds);
  pendingRecordings.add(pending);
  pending.finally(() => pendingRecordings.delete(pending));
  return pending;
}

async function drainPendingRecordings() {
  await Promise.allSettled([...pendingRecordings]);
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
      queueSessionRecording(sessionId, session, true);
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

  if (nextPhase === 'focus') {
    beginFocusRound(session);
  } else {
    session.phase = nextPhase;
    session.phaseStartTime = Date.now();
  }

  io.to(sessionId).emit('phase_change', {
    mode: session.mode,
    phase: nextPhase,
    phaseStartTime: session.phaseStartTime,
    focusDuration: session.focusDuration,
    breakDuration: session.breakDuration,
  });

  logger.info('session_phase_changed', {
    room_ref: correlationRef('room', sessionId),
    phase: nextPhase,
  });

  // Flow focus is open-ended and ends only when a player emits
  // finish_flow_focus — same as the initial start_session, which also skips
  // the timer for flow. Scheduling one here is what made rounds 2+ silently
  // auto-complete while the UI still offered a "take break" button.
  if (session.mode === 'flow' && nextPhase === 'focus') {
    session.phaseTimer = null;
    return;
  }

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

  // Snapshot participants before the removal — if this is the last player, the
  // abandoned-focus record below still needs to know who was in the session.
  const participantIds = sessionParticipantIds(session);

  const playerCount = removePlayer(session, socketId);
  logger.info('session_player_left', {
    room_ref: correlationRef('room', sessionId),
    socket_ref: correlationRef('socket', socketId),
    player_count: playerCount,
  });

  io.to(sessionId).emit('player_left', { playerId: socketId });

  if (playerCount === 0) {
    if (session.phase === 'focus') {
      queueSessionRecording(sessionId, session, false, participantIds);
    }
    if (session.phaseTimer) clearTimeout(session.phaseTimer);
    delete sessions[sessionId];
    metrics.increment('sessions_closed_total');
    logger.info('session_closed', {
      room_ref: correlationRef('room', sessionId),
      reason: 'empty',
    });
  }
  // Presence is refreshed *after* the removal, so it reflects where the user
  // actually is now. Clearing it unconditionally here wiped the row while
  // another tab was still in a live session — presence.js was made
  // multi-socket-aware but this DB mirror was left single-writer.
  if (player.userId) refreshPresence(player.userId);

  // If players remain, the session keeps running for them (solo continuation
  // is intentional — sessions can also be started solo).
}

// Point the profile row at whichever session this user is still in, or clear
// it when they're in none.
function refreshPresence(userId) {
  if (!userId) return;
  const remaining = findUserSessions(sessions, userId);
  if (remaining.length === 0) {
    clearPresence(userId);
    return;
  }
  const sessionId = remaining[0];
  setPresence(userId, sessionId, sessions[sessionId].world);
}

function leaveSession(socket, sessionId) {
  cancelPendingDisconnect(socket.id);
  delete socketToSession[socket.id];
  socket.leave(sessionId);
  finalizePlayerRemoval(sessionId, socket.id);
}

// Account deletion is not a disconnect: reconnect grace would deliberately
// preserve every slot for another minute. Remove all of the user's tabs from
// live rooms immediately and do not record an abandoned round for an identity
// whose history was just deleted.
function removeUserFromLiveSessions(userId) {
  for (const [sessionId, session] of Object.entries(sessions)) {
    const socketIds = Object.entries(session.players)
      .filter(([, player]) => player.userId === userId)
      .map(([socketId]) => socketId);

    for (const socketId of socketIds) {
      cancelPendingDisconnect(socketId);
      delete socketToSession[socketId];
      io.sockets.sockets.get(socketId)?.leave(sessionId);
      removePlayer(session, socketId);
      io.to(sessionId).emit('player_left', { playerId: socketId });
    }

    releasePlayerSlot(session, userId);
    if (socketIds.includes(session.hostId)) {
      session.hostId = Object.keys(session.players)[0] || null;
    }

    if (Object.keys(session.players).length === 0) {
      if (session.phaseTimer) clearTimeout(session.phaseTimer);
      delete sessions[sessionId];
      metrics.increment('sessions_closed_total');
      logger.info('session_closed', {
        room_ref: correlationRef('room', sessionId),
        account_ref: correlationRef('account', userId),
        reason: 'account_deleted',
      });
    }
  }
}

// ── Socket Handlers ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  metrics.increment('socket_connections_total');
  logger.info('socket_connected', {
    socket_ref: correlationRef('socket', socket.id),
  });

  // ── Presence registration ───────────────────────────────────────────────
  // Use verified socket.userId from auth middleware instead of client-sent userId
  socket.on('register_user', () => {
    const userId = socket.userId;
    if (!userId) return;
    // Additive: a second tab joins the user's socket set rather than
    // replacing the first. Only announce on the offline->online edge, so
    // opening tabs doesn't spam friends with presence updates.
    const cameOnline = presence.add(userId, socket.id);
    if (cameOnline) broadcastPresence(userId, true);
    logger.info('presence_registered', {
      account_ref: correlationRef('account', userId),
      socket_ref: correlationRef('socket', socket.id),
      came_online: cameOnline,
    });
  });

  // Permanent self-service deletion. Identity comes only from the verified
  // handshake; the payload cannot name another account. The exact confirmation
  // phrase prevents an accidental click or stale UI event from doing this.
  onPayload(socket, 'delete_account', async ({ confirmation }, respond) => {
    if (typeof respond !== 'function') return;
    if (confirmation !== 'DELETE') {
      respond({ ok: false, message: 'Type DELETE to confirm' });
      return;
    }
    if (!socket.userId || socket.accountDeletionPending) {
      respond({ ok: false, message: 'Account deletion is unavailable' });
      return;
    }

    socket.accountDeletionPending = true;
    const userId = socket.userId;
    try {
      await deleteAccountData(supabase, {
        userId,
        email: socket.userEmail,
      });
      removeUserFromLiveSessions(userId);
      respond({ ok: true });

      // Let the acknowledgement reach the requesting tab before terminating
      // every socket for this now-deleted account.
      setImmediate(() => {
        for (const client of io.sockets.sockets.values()) {
          if (client.userId === userId) client.disconnect(true);
        }
      });
    } catch (error) {
      socket.accountDeletionPending = false;
      metrics.increment('account_deletion_failures_total');
      logger.error('account_deletion_failed', {
        account_ref: correlationRef('account', userId),
        ...safeErrorFields(error),
      });
      respond({
        ok: false,
        message: 'Could not delete your account. Please try again.',
      });
    }
  }, {
    errorEvent: null,
    onInvalid: (respond) => {
      if (typeof respond === 'function') {
        respond({ ok: false, message: 'Invalid deletion request' });
      }
    },
  });

  onPayload(socket, 'get_online_friends', async ({ friendIds }, callback) => {
    if (typeof callback !== 'function') return;
    const userId = socket.userId;
    if (!userId) { callback([]); return; }

    // Bound both shape and work. A string has no Array#filter, and an
    // attacker-controlled giant list should not become a giant Set/filter pass.
    if (!Array.isArray(friendIds) || friendIds.length > 100 ||
        friendIds.some((id) => typeof id !== 'string')) {
      callback([]);
      return;
    }

    // Validate that queried IDs are actual accepted friends
    const actualFriendIds = await getFriendIds(userId);
    const friendSet = new Set(actualFriendIds);
    const validIds = (friendIds || []).filter(id => friendSet.has(id));
    const online = validIds.filter(id => presence.isOnline(id));
    callback(online);
  }, {
    errorEvent: null,
    onInvalid: (callback) => {
      if (typeof callback === 'function') callback([]);
    },
  });

  // ── Invite relay ────────────────────────────────────────────────────────
  onPayload(socket, 'send_invite', async ({ targetUserId, sessionId, fromName }) => {
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
    if (sessionId && sessions[sessionId] && !hasOpenPlayerSlot(sessions[sessionId])) {
      socket.emit('invite_error', { message: 'Session is full' });
      return;
    }

    // Friends only. get_online_friends already validates friendship; without
    // the same check here, any online user could be pushed an invite whose
    // attacker-controlled fromName renders in a full-screen modal.
    if (!(await areFriends(socket.userId, targetUserId))) {
      socket.emit('invite_error', { message: 'You can only invite friends' });
      return;
    }

    const targetSocketIds = presence.socketsFor(targetUserId);
    if (targetSocketIds.length === 0) {
      socket.emit('invite_error', { message: 'Friend is offline' });
      return;
    }
    // Use verified userId, not client-sent
    const fromUserId = socket.userId || null;
    const safeName = (typeof fromName === 'string' ? fromName : 'Someone').slice(0, MAX_DISPLAY_NAME);
    // The world a session is in is server state, so read it from there rather
    // than validating a client-sent copy. The invite popup shows this; taking
    // the sender's word for it let them advertise a session as somewhere it
    // isn't. It also can't go stale now that the rotation moves.
    const safeWorld = (typeof sessionId === 'string' && sessions[sessionId])
      ? sessions[sessionId].world
      : null;

    // Allowlist the invitee so the join gate lets them in
    if (typeof sessionId === 'string' && sessions[sessionId]) {
      inviteUser(sessions[sessionId], targetUserId);
    }
    // Deliver to every tab they have open — otherwise the popup can land in a
    // background tab they aren't looking at.
    for (const targetSocketId of targetSocketIds) {
      io.to(targetSocketId).emit('session_invite', {
        sessionId: typeof sessionId === 'string' ? sessionId : null,
        worldId: safeWorld,
        fromName: safeName,
        fromUserId,
      });
    }
    metrics.increment('session_invites_sent_total');
    logger.info('session_invite_sent', {
      room_ref: correlationRef('room', sessionId),
      target_ref: correlationRef('account', targetUserId),
    });
  }, { errorEvent: 'invite_error' });

  // create_session: { avatar, displayName, pet }
  // Creates a new session with a UUID, user becomes host.
  // userId comes from verified socket.userId (auth middleware).
  //
  // The world is NOT a parameter. It is whatever the rotation is on right now
  // (server/rotation.js) — one world, everybody, changing on the :30. A `world`
  // field in the payload is ignored rather than rejected, so an older client
  // still gets a session instead of an error. There is nothing left to validate
  // here because there is nothing left to trust.
  onPayload(socket, 'create_session', async ({ avatar, displayName, pet }) => {
    if (!rateLimits.createSession(socket.id)) {
      socket.emit('session_error', { message: 'Too many requests, slow down' });
      return;
    }
    // Input validation
    const safeName = (typeof displayName === 'string' ? displayName : 'Player').slice(0, MAX_DISPLAY_NAME);
    const safeWorld = worldAt();
    const safeAvatar = sanitizeAvatar(avatar);
    if (!safeAvatar) {
      socket.emit('session_error', { message: 'Invalid avatar' });
      return;
    }

    const prevSession = socketToSession[socket.id];
    if (prevSession) leaveSession(socket, prevSession);

    const userId = socket.userId || null;
    const safePet = sanitizePet(pet);
    const focusSeconds = await totalFocusSeconds(userId);

    const session = createSessionState(safeWorld, socket.id);
    const sessionId = session.id;
    sessions[sessionId] = session;

    socket.join(sessionId);
    socketToSession[socket.id] = sessionId;
    addPlayer(session, socket.id, {
      avatar: safeAvatar,
      displayName: safeName,
      userId,
      pet: safePet,
      // petStage in the payload is ignored the same way world is — the server
      // derives it from this user's completed focus, so two people never see
      // different animals in one room.
      petStage: safePet ? stageForTotal(focusSeconds) : null,
      focusSeconds: cachedFocus(focusSeconds),
    });

    if (userId) setPresence(userId, sessionId, safeWorld);

    metrics.increment('sessions_created_total');
    logger.info('session_created', {
      room_ref: correlationRef('room', sessionId),
      world: safeWorld,
    });

    socket.emit('session_created', { sessionId });
    socket.emit('sync_state', buildSyncPayload(session));
  });

  // create_share_invite: { sessionId }, acknowledgement: { ok, token, expiresAt }
  // Rotates a short-lived, single-use bearer token for the remaining seat.
  // The room UUID itself remains private and is never embedded in a link.
  onPayload(socket, 'create_share_invite', ({ sessionId }, respond) => {
    const reply = typeof respond === 'function' ? respond : () => {};
    if (!rateLimits.shareInvite(socket.id)) {
      reply({ ok: false, message: 'Too many requests, slow down' });
      return;
    }
    if (typeof sessionId !== 'string') {
      reply({ ok: false, message: 'Invalid session ID' });
      return;
    }
    const session = getSession(sessionId);
    if (!session) {
      reply({ ok: false, message: 'Session not found' });
      return;
    }
    if (!session.players[socket.id]) {
      reply({ ok: false, message: 'You are not in this session' });
      return;
    }
    if (!hasOpenPlayerSlot(session)) {
      reply({ ok: false, message: 'Session is full' });
      return;
    }

    const invite = createShareInvite(session);
    reply({ ok: true, token: invite.token, expiresAt: invite.expiresAt });
  }, {
    errorEvent: null,
    onInvalid: (respond) => {
      if (typeof respond === 'function') {
        respond({ ok: false, message: 'Invalid request' });
      }
    },
  });

  // join_session: { sessionId | shareToken, avatar, displayName, pet }
  // A session UUID still requires the normal friend/invite authorization. An
  // opaque share token is its own short-lived authorization for one new seat.
  // userId comes from verified socket.userId (auth middleware).
  onPayload(socket, 'join_session', async ({ sessionId: requestedSessionId, shareToken, avatar, displayName, pet }) => {
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
    const joiningByLink = typeof shareToken === 'string';
    if (joiningByLink && (shareToken.length < 20 || shareToken.length > 128)) {
      socket.emit('session_error', { message: 'Invite link is invalid or expired' });
      return;
    }

    let session;
    let sessionId;
    if (joiningByLink) {
      session = findSessionByShareInvite(sessions, shareToken);
      sessionId = session?.id;
    } else {
      if (typeof requestedSessionId !== 'string') {
        socket.emit('session_error', { message: 'Invalid session ID' });
        return;
      }
      sessionId = requestedSessionId;
      session = getSession(sessionId);
    }
    if (!session) {
      socket.emit('session_error', {
        message: joiningByLink ? 'Invite link is invalid or expired' : 'Session not found',
      });
      return;
    }

    const userId = socket.userId || null;

    // Authorize *before* touching any existing state — a refused join must not
    // eject the caller from the session they're already in.
    if (!joiningByLink && !(await canJoinSession(session, userId))) {
      socket.emit('session_error', { message: 'This session is private' });
      metrics.increment('session_join_rejections_total');
      logger.warn('session_join_rejected', {
        room_ref: correlationRef('room', sessionId),
        account_ref: correlationRef('account', userId),
        reason: 'private',
      });
      return;
    }

    // Reserve synchronously before the focus-total read below yields. A plain
    // player-count check lets two concurrent joins both see one open seat and
    // both enter after their database reads finish. Existing users bypass the
    // new-seat count so reconnecting to a full room remains valid.
    const slot = reservePlayerSlot(session, userId);
    if (!slot.ok) {
      socket.emit('session_error', { message: 'Session is full' });
      return;
    }

    // Claim the bearer token synchronously with the seat reservation. There is
    // no await between lookup, reservation, and consumption, so two recipients
    // cannot both redeem one link. A reconnecting participant does not consume
    // the link because it does not claim a new seat.
    if (joiningByLink && slot.reserved && !consumeShareInvite(session, shareToken)) {
      releasePlayerSlot(session, userId);
      socket.emit('session_error', { message: 'Invite link is invalid or expired' });
      return;
    }

    try {
      const safePet = sanitizePet(pet);
      const focusSeconds = await totalFocusSeconds(userId);
      const petStage = safePet ? stageForTotal(focusSeconds) : null;

      // The last live player can leave while this join is waiting on Supabase,
      // which deletes the in-memory session. Never join the detached old object.
      if (getSession(sessionId) !== session) {
        socket.emit('session_error', { message: 'Session not found' });
        return;
      }

      // Do not eject the caller from another room until this room has both
      // authorized them and held a seat for them.
      const prevSession = socketToSession[socket.id];
      if (prevSession && prevSession !== sessionId) leaveSession(socket, prevSession);

      // Reconnect: this user already has a player slot in the session under an
      // old socket id (grace-pending, or a zombie socket the server hasn't
      // noticed dropping yet). Look it up after the await so concurrent
      // reconnects always replace the freshest slot rather than duplicating it.
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
        metrics.increment('session_reconnects_total');
        logger.info('session_player_reconnected', {
          room_ref: correlationRef('room', sessionId),
          account_ref: correlationRef('account', userId),
          socket_ref: correlationRef('socket', socket.id),
        });
      }

      socket.join(sessionId);
      socketToSession[socket.id] = sessionId;
      const playerCount = addPlayer(session, socket.id, {
        avatar: safeAvatar,
        displayName: safeName,
        userId,
        pet: safePet,
        petStage,
        focusSeconds: cachedFocus(focusSeconds),
      });

      if (userId) setPresence(userId, sessionId, session.world);
      logger.info('session_player_joined', {
        room_ref: correlationRef('room', sessionId),
        socket_ref: correlationRef('socket', socket.id),
        player_count: playerCount,
      });

      socket.to(sessionId).emit('player_joined', {
        playerId: socket.id,
        avatar: safeAvatar,
        displayName: safeName,
        pet: safePet,
        petStage,
      });

      socket.emit('sync_state', buildSyncPayload(session));
    } finally {
      if (slot.reserved) releasePlayerSlot(session, userId);
    }
  });

  // start_session: { sessionId, focusDuration, breakDuration, mode }
  // Solo start allowed (1 player is fine).
  onPayload(socket, 'start_session', ({ sessionId, focusDuration, breakDuration, mode }) => {
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

    beginFocusRound(session);

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
    metrics.increment('focus_rounds_started_total');
    logger.info('focus_round_started', {
      room_ref: correlationRef('room', sessionId),
      mode: safeMode,
      focus_seconds: session.focusDuration,
      break_seconds: session.breakDuration,
      player_count: Object.keys(session.players).length,
    });
  });

  // finish_flow_focus: { sessionId }
  onPayload(socket, 'finish_flow_focus', ({ sessionId }) => {
    const session = getSession(sessionId);
    if (!session) return;
    if (session.mode !== 'flow' || session.phase !== 'focus') return;
    if (!session.players[socket.id]) return; // Only participants can trigger

    // Calculate actual elapsed focus time in seconds
    const elapsedSeconds = Math.round((Date.now() - session.phaseStartTime) / 1000);
    // Limit elapsed time to MAX_FOCUS
    const effectiveFocus = Math.min(elapsedSeconds, session.focusDuration);

    // NB: focusDuration stays at the MAX_FOCUS safety cap here. Overwriting it
    // with the elapsed time made the *next* flow round no longer open-ended —
    // it inherited the previous round's length as a hard timer — and also
    // shrank the denominator the client renders flow progress against.
    // recordSession derives the real figure from elapsed time in flow mode.
    // Calculate break: ~1/5 of focus time, min 60s, max MAX_BREAK
    session.breakDuration = Math.min(Math.max(60, Math.round(effectiveFocus / 5)), MAX_BREAK);

    // This logs the 'true' completion, since manual triggers are the proper way to end flow mode
    advancePhase(sessionId);
  });

  // stop_session: { sessionId }
  onPayload(socket, 'stop_session', ({ sessionId }) => {
    const session = getSession(sessionId);
    if (!session) return;
    if (!session.players[socket.id]) return; // Only participants can stop

    if (session.phase === 'focus') {
      queueSessionRecording(sessionId, session, false);
    }

    if (session.phaseTimer) {
      clearTimeout(session.phaseTimer);
      session.phaseTimer = null;
    }

    session.phase = 'waiting';
    session.phaseStartTime = null;
    session.focusRoundId = null;

    io.to(sessionId).emit('phase_change', {
      mode: session.mode,
      phase: 'waiting',
      phaseStartTime: null,
      focusDuration: session.focusDuration,
      breakDuration: session.breakDuration,
    });
  });

  // set_pet: { sessionId, pet }
  // Change your pet mid-session; relayed to the other player. Stage is
  // derived here, never taken from the payload, and emitted to the whole
  // room (including the sender) so the picker sees the server's size.
  onPayload(socket, 'set_pet', ({ sessionId, pet }) => {
    const session = getSession(sessionId);
    if (!session) return;
    const player = session.players[socket.id];
    if (!player) return; // Only participants
    const safePet = sanitizePet(pet);
    const petStage = safePet ? petStageAt(player.focusSeconds || 0) : null;
    setPlayerPet(session, socket.id, safePet, petStage);
    io.to(sessionId).emit('pet_changed', {
      playerId: socket.id,
      pet: safePet,
      petStage,
    });
  });

  // leave_session: no payload needed — the server knows which session this
  // socket is in. Trusting a client-sent id let a bogus one orphan the real
  // slot: leaveSession deletes socketToSession[socket.id] unconditionally,
  // then finalizePlayerRemoval no-ops on the unknown session. The player stays
  // in sessions[real].players with no socketToSession entry, so disconnect
  // skips its removal block too — the slot leaks permanently, the session is
  // never deleted, and its phase chain keeps recording fabricated focus.
  socket.on('leave_session', () => {
    const sessionId = socketToSession[socket.id];
    if (sessionId) leaveSession(socket, sessionId);
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
    metrics.increment('socket_disconnections_total');
    logger.info('socket_disconnected', {
      socket_ref: correlationRef('socket', socket.id),
    });
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
        logger.info('session_player_grace_started', {
          room_ref: correlationRef('room', sessionId),
          socket_ref: correlationRef('socket', socket.id),
          grace_seconds: RECONNECT_GRACE_MS / 1000,
        });
      } else if (session) {
        // Unauthenticated (dev mode) players can't be matched on reconnect
        finalizePlayerRemoval(sessionId, socket.id);
      }
    }

    // Drop this socket's rate-limit counters — they'd otherwise accumulate forever
    Object.values(rateLimits).forEach((limiter) => limiter.clear(socket.id));

    // Clean up presence
    const { userId, wentOffline } = presence.remove(socket.id);
    if (userId) {
      // Only actually offline once the user's last tab is gone.
      if (wentOffline) broadcastPresence(userId, false);
      logger.info('presence_socket_closed', {
        account_ref: correlationRef('account', userId),
        socket_ref: correlationRef('socket', socket.id),
        went_offline: wentOffline,
      });
    }
  });
});

// Live sessions are in-memory and die with the process, but profiles.
// current_session_id is in Postgres and doesn't. Render redeploys on every
// push to main, so without this sweep everyone who was mid-session at that
// moment keeps a "Join" button forever that always errors with "Session not
// found" — and migration 013's tasks_read keeps trusting that column as proof
// of where they are.
async function clearAllPresence(reason) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ current_session_id: null, current_world_id: null, current_room: null })
      .not('current_session_id', 'is', null);
    if (error) throw error;
    logger.info('presence_sweep_completed', { reason });
  } catch (error) {
    metrics.increment('presence_sweep_failures_total');
    logger.error('presence_sweep_failed', {
      reason,
      ...safeErrorFields(error),
    });
  }
}

function reportRuntimeSnapshot() {
  metrics.setGauge('connected_sockets', io.engine.clientsCount);
  metrics.setGauge('active_sessions', Object.keys(sessions).length);
  metrics.setGauge('pending_focus_recordings', pendingRecordings.size);
  metrics.logSnapshot();
}

metrics.increment('process_starts_total');
const metricsInterval = setInterval(reportRuntimeSnapshot, 60_000);
metricsInterval.unref();

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  // The bound port, not the requested one — PORT=0 means "pick a free one",
  // which is how createSession.test.js gets an instance without fighting a dev
  // server for 3001.
  logger.info('server_started', {
    port: server.address().port,
    allowed_origin_count: allowedOrigins.length,
  });
  reportRuntimeSnapshot();
  await clearAllPresence('boot');
});

// Render sends SIGTERM before replacing the instance. Clearing on the way out
// keeps the window where presence is wrong down to the deploy itself rather
// than lasting until someone happens to rejoin.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(metricsInterval);
    logger.info('shutdown_started', { signal });
    // Bound the entire drain, not only server.close(): an upstream request can
    // otherwise hang before the old force-exit timer was even installed.
    setTimeout(() => process.exit(0), 5000).unref();
    await Promise.allSettled([
      drainPendingRecordings(),
      clearAllPresence('shutdown'),
    ]);
    server.close(() => process.exit(0));
  });
}
