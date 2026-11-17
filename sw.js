// Cache hors-ligne : l'appli fonctionne même sans réseau une fois installée.
const VERSION = 'echecs-v1';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'lib/chess.js',
  'engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  ...['K', 'Q', 'R', 'B', 'N', 'P'].flatMap((p) => [`pieces/w${p}.svg`, `pieces/b${p}.svg`]),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
