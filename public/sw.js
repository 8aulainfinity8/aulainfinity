const CACHE_NAME = 'aulainfinity-pwa-cache-v8';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
];

// Installs assets and pre-caches the main app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching application core shell assets...');
        // Use map or catch individual errors so non-vital failures don't block install
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url => 
            cache.add(url).catch(err => console.warn(`Failed to pre-cache asset [${url}]:`, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activates and purges older cache generations
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Purging outdated cache instance:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handling with Network First for brand/images and Stale-While-Revalidate for app shell
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip browser extensions, external SDK assets or analytics, and write APIs (POST etc)
  if (!request.url.startsWith(self.location.origin) || request.method !== 'GET') {
    return;
  }

  // Handle image and brand assets with Network First strategy to prevent serving stale/corrupt cached files
  if (request.url.includes('/brand/') || request.destination === 'image') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || new Response('Asset not available offline', { status: 404, statusText: 'Not Found' });
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // In-cache response serves immediately, while updating the cache in the background
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((err) => {
          console.warn('[SW] Offline fetch fallback triggered:', err);
        });

      return cachedResponse || fetchPromise;
    }).catch(() => {
      // Fallback to offline shell if navigating and both cache & network fail
      if (request.mode === 'navigate') {
        return caches.match('/');
      }
    })
  );
});
