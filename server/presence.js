// Who is online, tracked per *user* rather than per socket.
//
// One user can legitimately hold several sockets at once — a second tab, a
// phone alongside a laptop, or briefly both sides of a reconnect. Collapsing
// that to a single socketId means the newest tab evicts the previous one, and
// then closing the newest marks the whole user offline while the first tab is
// still sitting there connected.
//
// Pure data structure, no socket.io. index.js owns the broadcasting.

function createPresenceRegistry() {
  const socketsByUser = new Map(); // userId   -> Set<socketId>
  const userBySocket = new Map(); // socketId -> userId

  return {
    /**
     * Register a socket for a user.
     * @returns true when this is the user's first socket, i.e. an
     *          offline→online transition worth broadcasting.
     */
    add(userId, socketId) {
      if (!userId || !socketId) return false;
      let sockets = socketsByUser.get(userId);
      const wasOffline = !sockets || sockets.size === 0;
      if (!sockets) {
        sockets = new Set();
        socketsByUser.set(userId, sockets);
      }
      sockets.add(socketId);
      userBySocket.set(socketId, userId);
      return wasOffline;
    },

    /**
     * Drop a socket.
     * @returns { userId, wentOffline } — wentOffline is true only when that
     *          was the user's last remaining socket. userId is null when the
     *          socket was never registered.
     */
    remove(socketId) {
      const userId = userBySocket.get(socketId);
      if (!userId) return { userId: null, wentOffline: false };
      userBySocket.delete(socketId);
      const sockets = socketsByUser.get(userId);
      if (!sockets) return { userId, wentOffline: true };
      sockets.delete(socketId);
      if (sockets.size > 0) return { userId, wentOffline: false };
      socketsByUser.delete(userId);
      return { userId, wentOffline: true };
    },

    /** Every live socket for a user — invites go to all of their tabs. */
    socketsFor(userId) {
      const sockets = socketsByUser.get(userId);
      return sockets ? [...sockets] : [];
    },

    isOnline(userId) {
      const sockets = socketsByUser.get(userId);
      return Boolean(sockets && sockets.size > 0);
    },

    userFor(socketId) {
      return userBySocket.get(socketId) ?? null;
    },
  };
}

module.exports = { createPresenceRegistry };
