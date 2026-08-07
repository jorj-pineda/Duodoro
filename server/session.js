const { randomUUID } = require("crypto");

function createSessionState(world, hostSocketId) {
  return {
    id: randomUUID(),
    mode: "pomodoro",
    phase: "waiting",
    focusDuration: 25 * 60,
    breakDuration: 5 * 60,
    phaseStartTime: null,
    phaseTimer: null,
    world: world || "forest",
    hostId: hostSocketId,
    players: {},
    // userIds explicitly invited to this session. Knowing the session UUID is
    // not by itself permission to join — see canJoinSession in index.js.
    invitedUserIds: new Set(),
  };
}

function inviteUser(session, userId) {
  if (!userId) return false;
  session.invitedUserIds.add(userId);
  return true;
}

function isInvited(session, userId) {
  return Boolean(userId) && session.invitedUserIds.has(userId);
}

function addPlayer(session, socketId, { avatar, displayName, userId, pet }) {
  session.players[socketId] = {
    avatar,
    displayName: displayName || "Player",
    userId: userId || null,
    pet: pet || null,
    disconnected: false,
  };
  return Object.keys(session.players).length;
}

function findPlayerByUserId(session, userId) {
  if (!userId) return null;
  for (const [socketId, player] of Object.entries(session.players)) {
    if (player.userId === userId) return socketId;
  }
  return null;
}

function markPlayerDisconnected(session, socketId, disconnected) {
  const player = session.players[socketId];
  if (!player) return false;
  player.disconnected = disconnected;
  return true;
}

function setPlayerPet(session, socketId, pet) {
  const player = session.players[socketId];
  if (!player) return false;
  player.pet = pet || null;
  return true;
}

function removePlayer(session, socketId) {
  delete session.players[socketId];
  return Object.keys(session.players).length;
}

// Distinct authenticated userIds currently holding a slot. Deduped because
// session_participants has a unique (session_id, user_id) index — a repeated id
// would fail the whole batch insert, losing the entire record.
function sessionParticipantIds(session) {
  return [
    ...new Set(
      Object.values(session.players)
        .map((p) => p.userId)
        .filter(Boolean),
    ),
  ];
}

function buildSyncPayload(session) {
  return {
    mode: session.mode,
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

module.exports = {
  createSessionState,
  addPlayer,
  removePlayer,
  setPlayerPet,
  inviteUser,
  isInvited,
  findPlayerByUserId,
  markPlayerDisconnected,
  sessionParticipantIds,
  buildSyncPayload,
};
