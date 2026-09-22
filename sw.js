const CACHE_NAME = 'mokalmat-v3';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js'
];

// ⭐ تثبيت + تخزين مؤقت للملفات الأساسية
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// ⭐ تفعيل + حذف الكاش القديم
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

// ⭐ استراتيجية: cache-first للملفات الثابتة، network-first للـ API
self.addEventListener('fetch', (e) => {
    const url = e.request.url;

    // لا تخزن طلبات API أو Socket.IO
    if (url.includes('/api/') || url.includes('/socket.io/') || url.includes('translate.googleapis')) {
        return;
    }

    // Cache-first للملفات الثابتة
    if (e.request.method === 'GET') {
        e.respondWith(
            caches.match(e.request).then(cached => {
                if (cached) {
                    // ⭐ تحديث في الخلفية
                    fetch(e.request).then(res => {
                        if (res && res.status === 200) {
                            caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
                        }
                    }).catch(() => {});
                    return cached;
                }
                return fetch(e.request).then(res => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                    }
                    return res;
                });
            })
        );
    }
});

