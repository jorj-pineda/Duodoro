// Shared boundary helpers for client-originated Socket.IO events.
//
// TypeScript types would only describe Duodoro's own client. A browser can
// connect with any Socket.IO client and send null, arrays, primitives, or
// malformed objects, so the server has to check the runtime value before a
// handler reads fields from it.

function isPayloadObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Keep errors thrown by one client event inside that socket's handler.
 * EventEmitter does not await promises returned by listeners, so both the
 * synchronous throw and rejected-promise paths need an explicit boundary.
 */
function safeSocketHandler(handler, onError) {
  return (...args) => {
    try {
      const result = handler(...args);
      if (result && typeof result.then === "function") {
        result.catch(onError);
      }
    } catch (error) {
      onError(error);
    }
  };
}

module.exports = { isPayloadObject, safeSocketHandler };
