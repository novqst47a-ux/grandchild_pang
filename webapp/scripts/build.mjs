import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'dist');
// index.html과 styles.css는 Vite가 번들 경로로 변환하므로 원본으로 덮어쓰지 않는다.
const files = ['manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png'];

await mkdir(join(output, 'assets', 'celebrations'), { recursive: true });
for (const file of files) {
  await stat(join(root, file));
  await cp(join(root, file), join(output, file));
}
for (const file of ['good.png', 'cool.png', 'amazing.png']) await cp(join(root, 'assets', 'celebrations', file), join(output, 'assets', 'celebrations', file));
console.log('추가 정적 배포 파일을 dist에 복사했습니다.');
