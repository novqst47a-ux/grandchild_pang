import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const manifestUrl = new URL('../assets/frames/frames.json', import.meta.url);
const framesRoot = fileURLToPath(new URL('../assets/frames/', import.meta.url));
const read = (url) => readFile(url, 'utf8');

function localAsset(value, id, field) {
  assert.equal(typeof value, 'string', `${id}.${field} 경로가 필요합니다.`);
  const url = new URL(value, manifestUrl);
  const path = fileURLToPath(url);
  assert.ok(path.startsWith(framesRoot), `${id}.${field}은 assets/frames 안에 있어야 합니다.`);
  return url;
}

function assertSvgCanvas(source, id, field) {
  assert.match(source, /<svg\b[^>]*\bviewBox=["']0 0 256 256["']/i, `${id}.${field}의 viewBox는 0 0 256 256이어야 합니다.`);
}

test('프레임 목록과 SVG 파일 구성이 올바르다', async () => {
  const frames = JSON.parse(await read(manifestUrl));
  assert.ok(Array.isArray(frames) && frames.length > 0 && frames.length <= 24);
  const ids = new Set();

  for (const frame of frames) {
    assert.match(frame.id, /^[a-z0-9][a-z0-9-]*$/);
    assert.ok(!ids.has(frame.id), `중복 프레임 id: ${frame.id}`);
    ids.add(frame.id);
    assert.ok(typeof frame.name === 'string' && frame.name.trim());
    assert.ok(Array.isArray(frame.holeCenter) && frame.holeCenter.length === 2);
    assert.ok(frame.holeCenter.every((value) => Number.isFinite(value) && value >= 0 && value <= 256));
    assert.match(frame.outline, /^#[0-9a-f]{6}$/i);
    assert.ok(Number.isFinite(frame.outlineWidth) && frame.outlineWidth >= 0 && frame.outlineWidth <= 24);

    const [artwork, mask] = await Promise.all([
      read(localAsset(frame.artwork, frame.id, 'artwork')),
      read(localAsset(frame.mask, frame.id, 'mask')),
    ]);
    assertSvgCanvas(artwork, frame.id, 'artwork');
    assertSvgCanvas(mask, frame.id, 'mask');

    const holeIds = [...mask.matchAll(/\bid=["']photo-hole["']/gi)];
    assert.equal(holeIds.length, 1, `${frame.id}.mask에는 #photo-hole이 하나 있어야 합니다.`);
    assert.match(mask, /<path\b[^>]*\bd=["'][^"']+["']/i, `${frame.id}.mask의 photo-hole 안에 경로가 필요합니다.`);
  }
});

test('서비스 워커가 프레임 목록에서 오프라인 자산을 읽는다', async () => {
  const worker = await read(new URL('../sw.js', import.meta.url));
  assert.match(worker, /assets\/frames\/frames\.json/);
  assert.match(worker, /frame\.artwork/);
  assert.match(worker, /frame\.mask/);
});
