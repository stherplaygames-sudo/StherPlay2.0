const STATIC_CACHE = 'sther-static-v12';
const DYNAMIC_CACHE = 'sther-dynamic-v12';

const STATIC_FILES = [
  '/',
  '/index.html',
  '/src/styles/main.css',
  '/src/store/appState.js',
  '/src/utils/appUtils.js',
  '/src/services/sheetsService.js',
  '/src/pages/searchPage.js',
  '/src/pages/customersPage.js',
  '/src/pages/subscriptionsPage.js',
  '/src/pages/vencimientosPage.js',
  '/src/utils/pwa.js',
  '/src/app.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_FILES);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
            return caches.delete(key);
          }
        })
      )
    )
  );

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    !event.request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  const requestURL = new URL(event.request.url);

  if (requestURL.href.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (STATIC_FILES.includes(requestURL.pathname)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const cloned = networkResponse.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(event.request, cloned);
        });

        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
