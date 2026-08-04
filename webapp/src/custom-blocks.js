const TAU = Math.PI * 2;

function circle(cx, cy, radius) {
  const path = new Path2D();
  path.arc(cx, cy, radius, 0, TAU);
  return path;
}

function ellipse(cx, cy, rx, ry) {
  const path = new Path2D();
  path.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  return path;
}

function roundedRect(x, y, width, height, radius) {
  const path = new Path2D();
  // Path2D.roundRect()가 없는 구형 브라우저에서도 동작하도록
  // 기본 Canvas 경로 명령만으로 같은 모양을 만든다.
  const safeRadius = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
  const right = x + width;
  const bottom = y + height;
  path.moveTo(x + safeRadius, y);
  path.lineTo(right - safeRadius, y);
  path.quadraticCurveTo(right, y, right, y + safeRadius);
  path.lineTo(right, bottom - safeRadius);
  path.quadraticCurveTo(right, bottom, right - safeRadius, bottom);
  path.lineTo(x + safeRadius, bottom);
  path.quadraticCurveTo(x, bottom, x, bottom - safeRadius);
  path.lineTo(x, y + safeRadius);
  path.quadraticCurveTo(x, y, x + safeRadius, y);
  path.closePath();
  return path;
}

function polygon(cx, cy, outer, points, inner = outer) {
  const path = new Path2D();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 ? inner : outer;
    const angle = -Math.PI / 2 + index * Math.PI / points;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (!index) path.moveTo(x, y); else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

function heart(cx, cy, width, height = width) {
  const path = new Path2D();
  const hw = width / 2;
  const hh = height / 2;
  path.moveTo(cx, cy + hh);
  path.bezierCurveTo(cx - hw * 1.2, cy + hh * .25, cx - hw, cy - hh * .7, cx - hw * .42, cy - hh * .7);
  path.bezierCurveTo(cx - hw * .08, cy - hh * .7, cx, cy - hh * .34, cx, cy - hh * .14);
  path.bezierCurveTo(cx, cy - hh * .34, cx + hw * .08, cy - hh * .7, cx + hw * .42, cy - hh * .7);
  path.bezierCurveTo(cx + hw, cy - hh * .7, cx + hw * 1.2, cy + hh * .25, cx, cy + hh);
  path.closePath();
  return path;
}

function paint(ctx, path, fill, stroke = null, lineWidth = 0) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(path); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.lineJoin = 'round'; ctx.stroke(path); }
}

// 색은 docs/DESIGN.md §1.3 팔레트를 색상 계열로 매핑한 것(계획 문서 D1).
// 슬롯 번호 순서대로 넣으면 해님이 빨강, 하트가 주황이 되어 이름과 어긋난다.
// colors = [면, 립]. 립은 CSS 립(0 6px 0)과 캔버스 테두리에 함께 쓰이며,
// 다섯 립 모두 게임판 바닥(--board) 대비 3:1 이상이어야 한다.
// 해님 립만 §1.3 원안(#c98a00, 2.41:1)에서 계획 §5.2 보정값으로 바꿨다.
export const DEFAULT_BLOCKS = [
  // spoken은 화면 낭독용. 화면에서 색과 모양을 함께 주는 것처럼 음성에도 둘 다 준다.
  { name: '해님', short: '해', spoken: '노란 해님', colors: ['#ffc53d', '#9a6800'], tint: '#fff3cc', shape: 'sun' },
  { name: '하트', short: '하', spoken: '빨간 하트', colors: ['#e2483d', '#b32e26'], tint: '#ffdedb', shape: 'heart' },
  { name: '별', short: '별', spoken: '주황 별', colors: ['#ff8a1f', '#c75e00'], tint: '#ffe4c9', shape: 'star' },
  { name: '꽃', short: '꽃', spoken: '초록 꽃', colors: ['#34a06a', '#1f7049'], tint: '#d6f2e4', shape: 'flower' },
  { name: '보석', short: '보', spoken: '파란 보석', colors: ['#3d8fe0', '#2464a8'], tint: '#d8eafb', shape: 'diamond' },
];

// 다섯 블록 면의 상호 대비는 1.03~1.49:1로 사실상 밝기가 같다.
// 모양 배지는 장식이 아니라 색맹·저시력 사용자에게 유일한 구분 수단이다.
// 유니코드 글리프(☀ ✿)는 브라우저·운영체제에 따라 컬러 이모지로 바뀌거나 빠질 수 있으므로
// 폰트에 의존하지 않는 인라인 SVG로 그린다. viewBox는 0 0 24 24.
function polygonPath(cx, cy, outer, points, inner = outer) {
  let d = '';
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 ? inner : outer;
    const angle = -Math.PI / 2 + index * Math.PI / points;
    d += `${index ? 'L' : 'M'}${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`;
  }
  return `${d}Z`;
}

function circlePath(cx, cy, radius) {
  return `M${(cx - radius).toFixed(2)} ${cy}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
}

export const BADGE_PATHS = {
  sun: polygonPath(12, 12, 11, 8, 6.5),
  star: polygonPath(12, 12, 11, 5, 4.6),
  diamond: polygonPath(12, 12, 11, 2),
  heart: 'M12 21.3C4 15.4 2 11.5 2 8.6 2 5.5 4.4 3.5 7 3.5c2.2 0 3.9 1.2 5 2.9 1.1-1.7 2.8-2.9 5-2.9 2.6 0 5 2 5 5.1 0 2.9-2 6.8-10 12.7Z',
  flower: [0, 1, 2, 3, 4]
    .map((index) => {
      const angle = -Math.PI / 2 + index * TAU / 5;
      return circlePath(12 + Math.cos(angle) * 6, 12 + Math.sin(angle) * 6, 4.6);
    })
    .join('') + circlePath(12, 12, 3.2),
};

const FRAME_MANIFEST_URL = new URL('./assets/frames/frames.json', document.baseURI);

// 프레임 그림과 사진 구멍은 코드가 아니라 assets/frames에서 관리한다.
// 배열 참조는 유지하고, 파일 로딩이 끝나면 내용을 채운다.
export const FRAMES = [];
let framesPromise = null;

function frameAssetUrl(value, field, id) {
  if (typeof value !== 'string' || !value) throw new Error(`${id} 프레임의 ${field} 경로가 비어 있어요`);
  const url = new URL(value, FRAME_MANIFEST_URL);
  if (url.protocol !== FRAME_MANIFEST_URL.protocol || url.origin !== FRAME_MANIFEST_URL.origin) {
    throw new Error(`${id} 프레임의 ${field}은 프로젝트 안의 파일이어야 해요`);
  }
  return url;
}

async function loadArtwork(url, id) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${id} 프레임 그림을 읽지 못했어요`);
  const svgDocument = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  const root = svgDocument.documentElement;
  if (svgDocument.querySelector('parsererror') || root.localName !== 'svg'
      || root.getAttribute('viewBox')?.trim() !== '0 0 256 256') {
    throw new Error(`${id} 프레임 그림의 SVG 형식을 확인해 주세요`);
  }

  // Illustrator 등이 width/height를 100%로 내보내도 캔버스에서 찌그러지지 않게 한다.
  root.setAttribute('width', '256');
  root.setAttribute('height', '256');
  const source = new XMLSerializer().serializeToString(root);
  const objectUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`${id} 프레임 그림을 읽지 못했어요`));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadMaskPath(url, id) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${id} 프레임 마스크를 읽지 못했어요`);
  const svgDocument = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  if (svgDocument.querySelector('parsererror')) throw new Error(`${id} 프레임 마스크의 SVG 형식이 올바르지 않아요`);
  const holeRoot = svgDocument.querySelector('#photo-hole');
  const elements = holeRoot?.localName === 'path' ? [holeRoot] : [...(holeRoot?.querySelectorAll('path') ?? [])];
  if (!elements.length) throw new Error(`${id} 프레임 마스크에는 #photo-hole 경로가 필요해요`);

  try {
    const result = new Path2D();
    for (const element of elements) {
      const pathData = element.getAttribute('d')?.trim();
      if (!pathData) throw new Error('empty path');
      const hierarchy = [];
      for (let node = element; node && node !== svgDocument.documentElement; node = node.parentElement) hierarchy.unshift(node);
      const matrix = hierarchy.reduce((current, node) => {
        const transform = node.getAttribute('transform');
        return transform ? current.multiply(new DOMMatrix(transform)) : current;
      }, new DOMMatrix());
      result.addPath(new Path2D(pathData), matrix);
    }
    return result;
  } catch { throw new Error(`${id} 프레임의 사진 구멍 경로를 읽지 못했어요`); }
}

function validateFrameDefinition(frame, ids) {
  if (!frame || typeof frame !== 'object') throw new Error('프레임 설정 형식이 올바르지 않아요');
  if (typeof frame.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(frame.id) || ids.has(frame.id)) {
    throw new Error('프레임 id는 겹치지 않는 영문 소문자 이름이어야 해요');
  }
  ids.add(frame.id);
  if (typeof frame.name !== 'string' || !frame.name.trim() || frame.name.length > 20) throw new Error(`${frame.id} 프레임 이름을 확인해 주세요`);
  if (!Array.isArray(frame.holeCenter) || frame.holeCenter.length !== 2
      || frame.holeCenter.some((value) => !Number.isFinite(value) || value < 0 || value > 256)) {
    throw new Error(`${frame.id} 프레임의 holeCenter를 확인해 주세요`);
  }
  if (typeof frame.outline !== 'string' || !/^#[0-9a-f]{6}$/i.test(frame.outline)) throw new Error(`${frame.id} 프레임의 outline 색상을 확인해 주세요`);
  if (!Number.isFinite(frame.outlineWidth) || frame.outlineWidth < 0 || frame.outlineWidth > 24) throw new Error(`${frame.id} 프레임의 outlineWidth를 확인해 주세요`);
}

async function readFrames() {
  const response = await fetch(FRAME_MANIFEST_URL);
  if (!response.ok) throw new Error('프레임 목록을 읽지 못했어요');
  const definitions = await response.json();
  if (!Array.isArray(definitions) || !definitions.length || definitions.length > 24) throw new Error('프레임 목록을 확인해 주세요');
  const ids = new Set();
  const loaded = await Promise.all(definitions.map(async (definition) => {
    validateFrameDefinition(definition, ids);
    const artworkUrl = frameAssetUrl(definition.artwork, 'artwork', definition.id);
    const maskUrl = frameAssetUrl(definition.mask, 'mask', definition.id);
    const [artworkImage, holePath] = await Promise.all([
      loadArtwork(artworkUrl, definition.id),
      loadMaskPath(maskUrl, definition.id),
    ]);
    return {
      id: definition.id,
      name: definition.name.trim(),
      holeCenter: [...definition.holeCenter],
      outline: definition.outline,
      outlineWidth: definition.outlineWidth,
      artworkImage,
      holePath,
    };
  }));
  FRAMES.splice(0, FRAMES.length, ...loaded);
  frameCache.clear();
  return FRAMES;
}

export function loadFrames() {
  framesPromise ||= readFrames().catch((error) => { framesPromise = null; throw error; });
  return framesPromise;
}

const frameCache = new Map();

function scaledHole(frame, scale) {
  const source = frame.holePath;
  if (scale === 1) return source;
  const [cx, cy] = frame.holeCenter;
  const path = new Path2D();
  path.addPath(source, new DOMMatrix().translate(cx, cy).scale(scale).translate(-cx, -cy));
  return path;
}

function frameLayer(frame, holeScale) {
  const key = `${frame.id}:${holeScale.toFixed(3)}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(frame.artworkImage, 0, 0, 256, 256);
  const hole = scaledHole(frame, holeScale);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fill(hole);
  ctx.restore();
  ctx.strokeStyle = frame.outline;
  ctx.lineWidth = frame.outlineWidth;
  ctx.stroke(hole);
  frameCache.set(key, canvas);
  return canvas;
}

export function drawPhoto(ctx, image, transform) {
  ctx.save();
  ctx.translate(128 + transform.x, 128 + transform.y);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  ctx.restore();
}

// slot을 주면 그 슬롯 색으로 256 전면을 채운 뒤 프레임과 사진을 얹는다(계획 D2).
// 프레임은 토끼 귀·하트처럼 불규칙한 실루엣이라 바탕이 없으면 CSS 립이 밖으로 삐져나온다.
// 바탕이 있으면 손자 사진 다섯 장이 비슷해도 블록 자리별로 구분된다.
export function renderCustomBlock(ctx, size, { frame, holeScale, image, transform, cropGuide = false, slot = null }) {
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.scale(size / 256, size / 256);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (slot !== null) blockFace(ctx, slot);
  const hole = scaledHole(frame, holeScale);
  if (cropGuide && image) {
    ctx.save(); ctx.globalAlpha = .2; drawPhoto(ctx, image, transform); ctx.restore();
  }
  ctx.save();
  ctx.clip(hole);
  ctx.fillStyle = '#e6e1d8';
  ctx.fillRect(0, 0, 256, 256);
  if (image) drawPhoto(ctx, image, transform);
  ctx.restore();
  ctx.drawImage(frameLayer(frame, holeScale), 0, 0);
  ctx.restore();
}

export function customBlockDataUrl(options) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  renderCustomBlock(canvas.getContext('2d'), 256, options);
  return canvas.toDataURL('image/webp', .9);
}

export function drawFramePreview(canvas, frame) {
  canvas.width = canvas.height = 132;
  const ctx = canvas.getContext('2d');
  ctx.scale(132 / 256, 132 / 256);
  ctx.fillStyle = '#ddd5c9';
  ctx.fill(scaledHole(frame, .82));
  ctx.drawImage(frameLayer(frame, .82), 0, 0);
}

// 블록 면을 256 전면으로 채운다. 모서리 둥글리기는 CSS(border-radius + overflow)가 맡는다.
// 캔버스에서 둥글리면 타일 크기에 따라 CSS 반경과 어긋나, 모서리에서 CSS 립이 비쳐 보인다.
export function blockFace(ctx, slot) {
  const block = DEFAULT_BLOCKS[slot];
  ctx.fillStyle = block.colors[0];
  ctx.fillRect(0, 0, 256, 256);
  const sheen = ctx.createLinearGradient(0, 0, 0, 256);
  sheen.addColorStop(0, 'rgba(255,255,255,.28)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 256, 256);
}

export function defaultBlockDataUrl(type, size = 256) {
  const block = DEFAULT_BLOCKS[type];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.scale(size / 256, size / 256);
  blockFace(ctx, type);
  const [, lip] = block.colors;
  ctx.save(); ctx.shadowColor = '#2c1c1c66'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 7;

  if (block.shape === 'sun') {
    for (let index = 0; index < 12; index += 1) {
      const angle = index * TAU / 12;
      const x = 128 + Math.cos(angle) * 85; const y = 128 + Math.sin(angle) * 85;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); paint(ctx, roundedRect(-10, -25, 20, 50, 9), block.tint, lip, 5); ctx.restore();
    }
    paint(ctx, circle(128, 128, 68), block.tint, lip, 9);
  } else if (block.shape === 'heart') {
    paint(ctx, heart(128, 118, 166, 178), block.tint, lip, 10);
  } else if (block.shape === 'star') {
    paint(ctx, polygon(128, 128, 94, 5, 43), block.tint, lip, 10);
  } else if (block.shape === 'flower') {
    for (let index = 0; index < 6; index += 1) {
      const angle = index * TAU / 6;
      paint(ctx, circle(128 + Math.cos(angle) * 55, 128 + Math.sin(angle) * 55, 42), block.tint, lip, 7);
    }
    paint(ctx, circle(128, 128, 46), '#f2b705', lip, 8);
  } else {
    const diamond = new Path2D(); diamond.moveTo(128, 26); diamond.lineTo(225, 112); diamond.lineTo(128, 230); diamond.lineTo(31, 112); diamond.closePath();
    paint(ctx, diamond, block.tint, lip, 10);
    ctx.strokeStyle = block.colors[0]; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(31, 112); ctx.lineTo(225, 112); ctx.moveTo(128, 26); ctx.lineTo(88, 112); ctx.lineTo(128, 230); ctx.lineTo(170, 112); ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
  return canvas.toDataURL('image/webp', .9);
}

function downscale(image, maxSize = 1400) {
  const longest = Math.max(image.width, image.height);
  if (longest <= maxSize) return image;
  const scale = maxSize / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return canvas;
}

export async function decodePhoto(file) {
  if (window.createImageBitmap) {
    try { return downscale(await createImageBitmap(file, { imageOrientation: 'from-image' })); }
    catch { try { return downscale(await createImageBitmap(file)); } catch { /* fallback below */ } }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    return downscale(image);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function samplePhoto(seed = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 700; canvas.height = 900;
  const ctx = canvas.getContext('2d');
  const hue = (seed * 71 + 188) % 360;
  const gradient = ctx.createLinearGradient(0, 0, 700, 900);
  gradient.addColorStop(0, `hsl(${hue} 70% 66%)`); gradient.addColorStop(1, `hsl(${(hue + 48) % 360} 65% 38%)`);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 700, 900);
  ctx.fillStyle = '#513224'; ctx.beginPath(); ctx.ellipse(350, 340, 190, 220, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd6b8'; ctx.beginPath(); ctx.ellipse(350, 380, 160, 185, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#34251f'; ctx.beginPath(); ctx.arc(292, 365, 16, 0, TAU); ctx.arc(408, 365, 16, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#ab3a49'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(350, 395, 68, .2 * Math.PI, .8 * Math.PI); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 60px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('웃어요!', 350, 770);
  return canvas;
}

export function initialTransform(image) {
  const baseScale = Math.max(256 / image.width, 256 / image.height);
  return { x: 0, y: 0, scale: baseScale, baseScale };
}

// 저장된 이미지는 합성이 끝난 결과라 원본 사진이 없다. 재합성은 불가능하지만,
// 256×256 이미지를 슬롯 바탕 위에 다시 얹으면 새 합성과 같은 결과가 나온다(계획 D2-a).
// 이미 v2인 이미지에 적용해도 불투명한 면 아래에 같은 색이 한 겹 더 깔릴 뿐이라 결과가 같다.
// 버전 판정이 틀려도 화면이 깨지지 않는다는 뜻이다.
export async function upgradeBlockImage(dataUrl, slot) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('저장된 블록 이미지를 읽지 못했어요'));
    image.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  blockFace(ctx, slot);
  ctx.drawImage(image, 0, 0, 256, 256);
  return canvas.toDataURL('image/webp', .9);
}

export const BLOCK_FORMAT_VERSION = 2;

export function safePresetData(data) {
  const version = data?.version;
  if (!data || (version !== 1 && version !== 2) || !Array.isArray(data.blocks) || data.blocks.length !== DEFAULT_BLOCKS.length) {
    throw new Error('손주팡에서 만든 파일이 아니에요');
  }
  const blocks = data.blocks.map((value) => {
    if (value === null) return null;
    if (typeof value !== 'string' || !value.startsWith('data:image/') || value.length > 6_000_000) throw new Error('이미지 형식이 올바르지 않아요');
    return value;
  });
  return { version, blocks };
}
