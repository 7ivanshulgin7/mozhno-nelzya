// Офлайн-кэш. При обновлении сайта поднять версию в CACHE.
const CACHE = "mn-v1.39";
const NET_WAIT_MS = 1500; // сколько ждём сеть, если в кэше уже есть версия
const FILES = ["./", "index.html", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Шрифты Google: из кэша, если есть
  if (url.host.endsWith("fonts.googleapis.com") || url.host.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== location.origin) return;

  // Свои файлы. Запрос в сеть уходит сразу и не обрывается: докачивается в фоне
  // и обновляет кэш — новая версия будет при следующем запуске.
  let putDone;
  const saved = new Promise(res => { putDone = res; });
  const net = fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); putDone(caches.open(CACHE).then(c => c.put(req, copy))); }
    else putDone();
    return r;
  }, err => { putDone(); throw err; });
  e.waitUntil(saved.catch(err => console.error("sw: не удалось обновить кэш", err)));

  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    // В кэше пусто — ждём сеть; без сети — index.html
    if (!hit) return net.catch(() => caches.match("index.html"));
    // В кэше есть — сеть ждём не дольше NET_WAIT_MS, потом отдаём кэш
    const fallback = new Promise(res => setTimeout(() => res(hit), NET_WAIT_MS));
    return Promise.race([net.then(r => (r.ok ? r : hit), () => hit), fallback]);
  }));
});

// Нажатие на уведомление таймера — открыть приложение
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
});
