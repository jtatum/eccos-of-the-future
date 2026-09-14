const RELEASE = '2026.09.10.2';
const CACHE = `ecco-v12-open-laboratory-${RELEASE}`;
let replacingEarlierShell = false;
const SHELL = [
  './',
  './index.html',
  `./styles.css?v=${RELEASE}`,
  `./app.js?v=${RELEASE}`,
  `./manifest.webmanifest?v=${RELEASE}`,
  './src/ecco-core.mjs',
  './src/mission-rules.mjs',
  './src/initiation.mjs',
  './src/return-filter.mjs',
  './src/spiral-engine.mjs',
  './.well-known/ecco-challenge.json',
  './.well-known/ecco-laboratory.json',
  './ecco/manifest.json',
  './ecco/missions.json',
  './ecco/initiation.json',
  './ecco/return-profile.json',
  './ecco/action-rule.json',
  './ecco/protocol.md',
  './ecco/seed-capsule.json',
  './ecco/keys.txt',
  './llms.txt',
  './AGENTS.md',
  './assets/ecco-mark.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        replacingEarlierShell = keys.some((key) => key.startsWith('ecco-') && key !== CACHE);
        return Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => Promise.all(clients.map((client) => {
        client.postMessage({ type: 'ECCO_SHELL_UPDATED', release: RELEASE });
        if (replacingEarlierShell && typeof client.navigate === 'function') {
          return client.navigate(client.url);
        }
        return undefined;
      })))
  );
});

async function remember(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    await remember(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await remember(request, response);
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === 'navigate';
  const isExecutable = ['script', 'style', 'worker'].includes(event.request.destination);
  const isGameData = /\.(?:html|js|mjs|css|json|txt|md)$/u.test(requestUrl.pathname);

  if (isNavigation) {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  event.respondWith(
    isExecutable || isGameData
      ? networkFirst(event.request)
      : cacheFirst(event.request)
  );
});
