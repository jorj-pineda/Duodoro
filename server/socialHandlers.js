const { hasOpenPlayerSlot, inviteUser } = require('./session');
const { parseOnlineFriends, parseSendInvite } = require('./payloadParsers');
const { correlationRef } = require('./observability');

function registerSocialHandlers({
  socket,
  io,
  onPayload,
  presence,
  sessions,
  getFriendIds,
  areFriends,
  inviteRateLimit,
  metrics,
  logger,
}) {
  onPayload(socket, 'get_online_friends', async (payload, callback) => {
    if (typeof callback !== 'function') return;
    const userId = socket.userId;
    if (!userId) { callback([]); return; }

    const parsed = parseOnlineFriends(payload);
    if (!parsed.ok) {
      callback([]);
      return;
    }

    // A caller can only query accepted friends, even if it supplies other ids.
    const actualFriendIds = await getFriendIds(userId);
    const friendSet = new Set(actualFriendIds);
    const online = parsed.value.friendIds
      .filter((id) => friendSet.has(id))
      .filter((id) => presence.isOnline(id));
    callback(online);
  }, {
    errorEvent: null,
    onInvalid: (callback) => {
      if (typeof callback === 'function') callback([]);
    },
  });

  onPayload(socket, 'send_invite', async (payload) => {
    if (!inviteRateLimit(socket.id)) {
      socket.emit('invite_error', { message: 'Too many invites, slow down' });
      return;
    }
    const parsed = parseSendInvite(payload);
    if (!parsed.ok) return;
    const { targetUserId, sessionId, fromName } = parsed.value;
    const session = sessionId ? sessions[sessionId] : null;

    if (session && !session.players[socket.id]) {
      socket.emit('invite_error', { message: 'You are not in this session' });
      return;
    }
    if (session && !hasOpenPlayerSlot(session)) {
      socket.emit('invite_error', { message: 'Session is full' });
      return;
    }
    if (!(await areFriends(socket.userId, targetUserId))) {
      socket.emit('invite_error', { message: 'You can only invite friends' });
      return;
    }

    const targetSocketIds = presence.socketsFor(targetUserId);
    if (targetSocketIds.length === 0) {
      socket.emit('invite_error', { message: 'Friend is offline' });
      return;
    }

    if (session) inviteUser(session, targetUserId);
    for (const targetSocketId of targetSocketIds) {
      io.to(targetSocketId).emit('session_invite', {
        sessionId,
        worldId: session?.world || null,
        fromName,
        fromUserId: socket.userId || null,
      });
    }
    metrics.increment('session_invites_sent_total');
    logger.info('session_invite_sent', {
      room_ref: correlationRef('room', sessionId),
      target_ref: correlationRef('account', targetUserId),
    });
  }, { errorEvent: 'invite_error' });
}

module.exports = { registerSocialHandlers };
