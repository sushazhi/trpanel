/* Service Worker: HTML 导航网络优先（发布即时生效），哈希静态资源缓存优先（离线可用） */
const CACHE = 'tm-cache-v2'
const PRECACHE = ['/manifest.webmanifest', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // 仅缓存同源静态资源
  if (url.origin !== self.location.origin) return
  // API/WS 不缓存
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return

  // 页面导航：网络优先，成功后写入缓存供离线回退
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone()
            caches.open(CACHE).then((cache) => cache.put(request, clone))
          }
          return resp
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    )
    return
  }

  // 其他静态资源：缓存优先，后台刷新
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
            const clone = resp.clone()
            caches.open(CACHE).then((cache) => cache.put(request, clone))
          }
          return resp
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
