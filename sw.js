// ===== SERVICE WORKER - ENTERPRISE OFFLINE SUPPORT =====
const CACHE_NAME = 'mnemoniqr-enterprise-v3.0.0';
const STATIC_CACHE = 'static-enterprise-v3';
const BIP39_CACHE = 'bip39-v2';

// Archivos críticos para caching
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json'
];

// Instalación y caching
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Service Worker installed');
        return self.skipWaiting();
      })
  );
});

// Activación y limpieza de caches antiguos
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== BIP39_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Estrategia: Cache First con fallback a Network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Para recursos estáticos: Cache First
  if (STATIC_ASSETS.some(asset => url.pathname.endsWith(asset.replace('/', '')))) {
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) {
            return response;
          }
          
          return fetch(request).then((fetchResponse) => {
            if (!fetchResponse || fetchResponse.status !== 200) {
              return fetchResponse;
            }
            
            const responseToCache = fetchResponse.clone();
            caches.open(STATIC_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache);
              });
              
            return fetchResponse;
          });
        })
    );
    return;
  }

  // Para BIP39 wordlist: Cache First con actualización en background
  if (url.href === 'https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt') {
    event.respondWith(
      caches.open(BIP39_CACHE)
        .then((cache) => {
          return cache.match(request)
            .then((response) => {
              // Siempre hacer fetch en background para actualizar
              const fetchPromise = fetch(request)
                .then((networkResponse) => {
                  if (networkResponse.ok) {
                    cache.put(request, networkResponse.clone());
                  }
                  return networkResponse;
                })
                .catch(() => null);

              // Retornar cache inmediatamente, actualizar en background
              if (response) {
                return response;
              }

              // Si no hay cache, esperar por la red
              return fetchPromise;
            });
        })
    );
    return;
  }

  // Para otras requests: Network First
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cachear respuestas exitosas
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        // Fallback al cache
        return caches.match(request);
      })
  );
});

// Manejo de mensajes desde la app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
