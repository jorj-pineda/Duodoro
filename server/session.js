const { randomUUID } = require("crypto");

function createSessionState(world, hostSocketId) {
  return {
    id: randomUUID(),
    phase: "waiting",
    focusDuration: 25 * 60,
    breakDuration: 5 * 60,
    phaseStartTime: null,
    phaseTimer: null,
    world: world || "forest",
    hostId: hostSocketId,
    players: {},
  };
}

function addPlayer(session, socketId, { avatar, displayName, userId }) {
  session.players[socketId] = {
    avatar,
    displayName: displayName || "Player",
    userId: userId || null,
  };
  return Object.keys(session.players).length;
}

function removePlayer(session, socketId) {
  delete session.players[socketId];
  return Object.keys(session.players).length;
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

module.exports = {
  createSessionState,
  addPlayer,
  removePlayer,
  buildSyncPayload,
};
