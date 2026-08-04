// 번들러를 걷어내면서 해시가 붙은 파일 이름(index-<hash>.js)이 사라졌다. 이제 src/app.js는
// 주소가 영원히 같으므로, 예전 cache-first 그대로 두면 캐시 이름을 올리는 것을 한 번 잊는
// 순간 어르신 화면이 영영 바뀌지 않는다. 그래서 stale-while-revalidate로 바꿨다.
//
//   1) 캐시에 있으면 그것을 즉시 내준다 (빠르고, 오프라인에서도 뜬다)
//   2) 동시에 네트워크로 다시 받아 캐시를 덮어쓴다
//   3) 따라서 다음에 열 때는 새 버전이 보인다 — 사람이 무엇을 잊어도 스스로 낫는다
//
// 캐시 이름 올리기는 여전히 권장한다. 그래야 한 번에 갈아끼워지고, 모듈 여러 개가
// 한 판에서 서로 다른 버전으로 섞이는 경우를 피할 수 있다. 다만 이제 필수는 아니다.
const CACHE = 'sonjupang-mvp-v9'; // v9: Capacitor·번들러 제거, 순수 PWA 전환
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './src/app.js',
  './src/game-core.js',
  './src/custom-blocks.js',
  './src/storage.js',
  './assets/celebrations/good.png',
  './assets/celebrations/cool.png',
  './assets/celebrations/amazing.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    const network = fetch(request).then((response) => {
      // 부분 응답이나 오류는 캐시에 넣지 않는다. 넣으면 깨진 응답이 그대로 굳는다.
      if (response.ok && response.status === 200) cache.put(request, response.clone());
      return response;
    }).catch(() => null);

    // 캐시가 있으면 네트워크를 기다리지 않는다. 갱신은 뒤에서 계속 진행된다.
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || new Response('오프라인이에요', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }));
});
