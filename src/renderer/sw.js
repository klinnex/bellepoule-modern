/**
 * BellePoule Modern - Service Worker
 * Offline-First Architecture with caching strategies
 * Licensed under GPL-3.0
 */

const CACHE_NAME = 'bellepoule-cache-v1';
const STATIC_CACHE = 'bellepoule-static-v1';
const DATA_CACHE = 'bellepoule-data-v1';

// Files to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/renderer/main.js',
  '/renderer/main.css',
  '/assets/icons/icon.png',
  '/assets/fonts/inter.woff2'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/competitions',
  '/api/fencers',
  '/api/pools',
  '/api/matches'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== STATIC_CACHE && 
                cacheName !== DATA_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Network interceptors - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle different request types
  if (isAPIRequest(url)) {
    // API requests: Network first, fallback to cache
    event.respondWith(networkFirstStrategy(request));
  } else if (isStaticAsset(request)) {
    // Static assets: Cache first
    event.respondWith(cacheFirstStrategy(request));
  } else {
    // Other requests: Network first, fallback to offline page
    event.respondWith(networkFirstWithOfflineFallback(request));
  }
});

// Check if request is for API
function isAPIRequest(url) {
  return API_ENDPOINTS.some(endpoint => url.pathname.startsWith(endpoint));
}

// Check if request is for static asset
function isStaticAsset(request) {
  return request.destination === 'script' ||
         request.destination === 'style' ||
         request.destination === 'image' ||
         request.destination === 'font';
}

// Cache First Strategy - for static assets
async function cacheFirstStrategy(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed for static asset:', request.url);
    throw error;
  }
}

// Network First Strategy - for API calls
async function networkFirstStrategy(request) {
  const cache = await caches.open(DATA_CACHE);

  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed for API, trying cache:', request.url);
    
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      // Add offline header to indicate cached data
      const response = cachedResponse.clone();
      response.headers.set('X-Offline-Cache', 'true');
      return response;
    }
    
    throw error;
  }
}

// Network First with Offline Fallback - for general requests
async function networkFirstWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Hors ligne - BellePoule Modern</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: system-ui, sans-serif; padding: 2rem; text-align: center; }
              .offline-icon { font-size: 4rem; margin-bottom: 1rem; }
              .message { color: #666; max-width: 400px; margin: 0 auto; }
            </style>
          </head>
          <body>
            <div class="offline-icon">📡</div>
            <h1>Mode Hors Ligne</h1>
            <p class="message">
              BellePoule Modern fonctionne actuellement en mode hors ligne.<br>
              Les données seront synchronisées dès que la connexion sera rétablie.
            </p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    throw error;
  }
}

// Background Sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Perform background synchronization
async function doBackgroundSync() {
  console.log('[SW] Performing background sync...');
  
  try {
    // Get pending actions from IndexedDB
    const pendingActions = await getPendingActions();
    
    for (const action of pendingActions) {
      try {
        await processAction(action);
        await removeAction(action.id);
      } catch (error) {
        console.error('[SW] Failed to process action:', action, error);
      }
    }
    
    console.log('[SW] Background sync completed');
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Message handling from main thread
self.addEventListener('message', (event) => {
  // Messages des seuls clients de même origine (CodeQL js/missing-origin-check)
  if (event.origin !== self.location.origin) return;
  const { type, payload } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_UPDATE':
      updateCache(payload.url, payload.data);
      break;
      
    case 'SYNC_REQUEST':
      registerSync();
      break;
      
    case 'GET_CACHE_STATUS':
      getCacheStatus().then(status => {
        event.ports[0].postMessage({ type: 'CACHE_STATUS', payload: status });
      });
      break;
  }
});

// Update cache with new data
async function updateCache(url, data) {
  try {
    const cache = await caches.open(DATA_CACHE);
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(url, response);
    console.log('[SW] Cache updated for:', url);
  } catch (error) {
    console.error('[SW] Failed to update cache:', error);
  }
}

// Register for background sync
async function registerSync() {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    try {
      await self.registration.sync.register('background-sync');
      console.log('[SW] Background sync registered');
    } catch (error) {
      console.error('[SW] Failed to register sync:', error);
    }
  }
}

// Get cache status information
async function getCacheStatus() {
  const [staticCache, dataCache] = await Promise.all([
    caches.open(STATIC_CACHE).then(cache => cache.keys()),
    caches.open(DATA_CACHE).then(cache => cache.keys())
  ]);

  return {
    staticAssets: staticCache.length,
    dataItems: dataCache.length,
    totalSize: await calculateCacheSize()
  };
}

// Calculate total cache size
async function calculateCacheSize() {
  // Pas de « const caches » : masquerait l'API globale (TDZ → ReferenceError)
  const openCaches = await Promise.all([
    caches.open(STATIC_CACHE),
    caches.open(DATA_CACHE)
  ]);

  let totalSize = 0;
  
  for (const cache of openCaches) {
    const keys = await cache.keys();
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }
  
  return totalSize;
}

// IndexedDB helpers for pending actions
async function getPendingActions() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BellePouleOffline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingActions'], 'readonly');
      const store = transaction.objectStore('pendingActions');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingActions')) {
        db.createObjectStore('pendingActions', { keyPath: 'id' });
      }
    };
  });
}

// Process individual action
async function processAction(action) {
  switch (action.type) {
    case 'UPDATE_MATCH':
      return fetch(`/api/matches/${action.matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.data)
      });
      
    case 'UPDATE_FENCER':
      return fetch(`/api/fencers/${action.fencerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.data)
      });
      
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// Remove processed action
async function removeAction(actionId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BellePouleOffline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['pendingActions'], 'readwrite');
      const store = transaction.objectStore('pendingActions');
      const deleteRequest = store.delete(actionId);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}

console.log('[SW] Service worker loaded');