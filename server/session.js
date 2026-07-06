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
  };
}

function addPlayer(session, socketId, { avatar, displayName, userId, pet }) {
  session.players[socketId] = {
    avatar,
    displayName: displayName || "Player",
    userId: userId || null,
    pet: pet || null,
  };
  return Object.keys(session.players).length;
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
  buildSyncPayload,
};
