/* Service Worker: mostra notificações push (FCM, Web Push padrão) e cuida do clique. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch { p = {}; }
  const d = p.data || {};
  const n = p.notification || {};
  const title = d.title || n.title || "Minhas Aulas";
  const body = d.body || n.body || "";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: d.tag || undefined,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: d.url || "./" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.focus(); c.postMessage({ type: "notification-click" }); return; } }
    await self.clients.openWindow(url);
  })());
});
