// 디자인 리뉴얼로 styles.css가 통째로 바뀐다. 캐시 이름을 올리지 않으면 기존 사용자에게
// 구 스타일이 계속 서빙된다. 스타일·문구를 바꾼 배포마다 이 값을 올릴 것.
const CACHE = 'sonjupang-mvp-v8'; // v8: A4 점수 카운트업 + A5 고대비 변형
const ASSETS = ['./', './index.html', './styles.css', './manifest.webmanifest', './icon-192.png', './icon-512.png', './assets/celebrations/good.png', './assets/celebrations/cool.png', './assets/celebrations/amazing.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  })));
});
