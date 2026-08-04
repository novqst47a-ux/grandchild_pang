// 개발용 정적 서버. 의존성이 없으므로 npm install 없이 그대로 돈다.
//
// 이 앱은 번들러를 쓰지 않는다. index.html이 src/app.js를 ES 모듈로 직접 불러오고
// 브라우저가 상대 경로 import를 따라간다. 그래서 개발 서버가 할 일은 파일을 올바른
// MIME 타입으로 내주는 것뿐이다. .js를 text/javascript로 주지 않으면 모듈 로드가 막힌다.
//
// 기본으로 모든 인터페이스에 바인딩한다. 실기기 점검 때 같은 Wi-Fi의 휴대폰에서
// 열어야 하기 때문이다. 사진 넣기는 <input type="file" capture>라 http로도 동작한다.
// 다만 서비스 워커와 홈 화면 설치는 보안 컨텍스트를 요구하므로 http LAN 주소에서는
// 확인할 수 없다. 그 둘은 HTTPS로 배포한 주소에서 확인할 것.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || '::';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  // normalize가 ../를 접은 뒤에도 root 밖을 가리키면 거부한다.
  const target = resolve(join(root, normalize(decoded)));
  if (target !== root && !target.startsWith(root + sep)) return null;
  try {
    const info = await stat(target);
    if (info.isDirectory()) return resolveFile(join(decoded, 'index.html'));
    return target;
  } catch { return null; }
}

const server = createServer(async (request, response) => {
  const file = await resolveFile(request.url || '/');
  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('404');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    // 고친 코드가 즉시 보여야 한다. 배포본의 캐시 정책은 sw.js가 따로 정한다.
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `  http://${entry.address}:${port}/  (같은 Wi-Fi의 휴대폰에서)`);
  console.log(`손주팡 개발 서버\n  http://localhost:${port}/\n${addresses.join('\n')}`);
});
