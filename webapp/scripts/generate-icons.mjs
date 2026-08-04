import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function checkIcon(size) {
  const path = join(root, `icon-${size}.png`);
  const file = await readFile(path);

  if (!file.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error(`${path} 파일이 PNG 형식이 아니에요`);
  }

  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  if (width !== size || height !== size) {
    throw new Error(`${path} 크기가 ${width}×${height}예요. ${size}×${size}가 필요해요`);
  }

  console.log(`확인: icon-${size}.png (${width}×${height})`);
}

// 앱 아이콘은 이미지 생성으로 만든 원본 디자인에서 고품질 리샘플링해 커밋한다.
// 이 명령은 생성된 디자인을 코드 그림으로 덮어쓰지 않고 필수 규격만 확인한다.
await Promise.all([192, 512].map(checkIcon));
