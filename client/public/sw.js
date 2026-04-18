// Minimal service worker for Duodoro PWA installability.
// No caching: timer state is server-authoritative — caching socket.io or API
// responses would risk showing stale session data. App shell lives on the
// network; this SW only exists so the browser considers the app installable.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch listener is required for installability but intentionally passthrough.
self.addEventListener("fetch", () => {});
