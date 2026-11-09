// Notificações do sistema (celular/desktop) via Service Worker.
let regPromise = null;

export function registerSW() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  regPromise ||= navigator.serviceWorker
    .register("./firebase-messaging-sw.js")
    .then(() => navigator.serviceWorker.ready)
    .catch((e) => { console.warn("SW:", e); return null; });
  return regPromise;
}

export const supported = () => "Notification" in window;
export const permission = () => (supported() ? Notification.permission : "unsupported");

export async function requestPermission() {
  if (!supported()) return "unsupported";
  return Notification.requestPermission();
}

export async function show(title, body, tag, url = "./") {
  if (permission() !== "granted") return false;
  const opts = { body, tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    renotify: true, requireInteraction: true, data: { url }, vibrate: [200, 100, 200] };
  try {
    const reg = await registerSW();
    if (reg) { await reg.showNotification(title, opts); return true; }
    new Notification(title, opts); return true;
  } catch { try { new Notification(title, opts); return true; } catch { return false; } }
}
