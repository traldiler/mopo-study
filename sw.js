/* Кэш оболочки: кабинет открывается быстро и переживает короткие обрывы связи.
   Данные (ответы, результаты) через кэш не идут — только сеть. */
const CACHE = "mopo-v55";
/* материалы и вопросы приходят с сервера по входу — в кэш оболочки не кладём */
const SHELL = ["./", "index.html", "styles.css", "app.js", "exam.js", "admin.js", "config.js", "img/logo-light.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;         /* запросы к серверу — всегда сеть */
  e.respondWith(
    fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : Promise.reject(new Error("offline")))))   /* подменять индексом можно только страницу, иначе ломаются материалы */
  );
});
