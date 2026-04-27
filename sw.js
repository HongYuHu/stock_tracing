/**
 * sw.js — Service Worker for offline-capable read-only access
 * Strategy: network-first for index.html, cache-first for assets.
 */

const CACHE_VERSION = 'stock-tracker-v12';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/app.css',
  './js/config.js',
  './js/api/sheets.js',
  './js/api/prices.js',
  './js/lib/cache.js',
  './js/lib/format.js',
  './js/lib/alerts.js',
  './js/tabs/holdings.js',
  './js/tabs/networth.js',
  './js/tabs/performance.js',
  './js/tabs/ai.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always network-first for GAS API calls
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('finance.yahoo.com')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // Network-first for HTML (ensures fresh deploys are picked up)
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for JS/CSS
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
