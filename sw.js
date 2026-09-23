/* ============================================================
   Mokalmat Service Worker — TURBO v4
   - Stale-while-revalidate for static assets
   - Skip cache for /api/, /socket.io/, /uploads/, YouTube, translate
   - Bump CACHE_NAME on every deploy
   ============================================================ */

const CACHE_NAME = 'mokalmat-v4';
const ASSETS = [
    '/',
    '/index.html'
    // ⭐ Do NOT precache CSS/JS — handled by SWR at runtime
];

// ⭐ Install — precache shell
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// ⭐ Activate — drop old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// ⭐ Fetch — stale-while-revalidate for static, bypass for dynamic
self.addEventListener('fetch', (e) => {
    const req = e.request;
    const url = new URL(req.url);

    // ⭐ Skip non-GET
    if (req.method !== 'GET') return;

    // ⭐ Skip dynamic paths (API, Socket.IO, uploads, cross-origin services)
    if (
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/socket.io/') ||
        url.pathname.startsWith('/uploads/') ||
        url.hostname.includes('translate.googleapis') ||
        url.hostname.includes('youtube') ||
        url.hostname.includes('ytimg') ||
        url.hostname.includes('noembed')
    ) {
        return;
    }

    // ⭐ Same-origin static → stale-while-revalidate
    if (url.origin === self.location.origin) {
        e.respondWith(
            caches.match(req).then(cached => {
                const network = fetch(req).then(res => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(req, clone));
                    }
                    return res;
                }).catch(() => cached);

                return cached || network;
            })
        );
    }
});

