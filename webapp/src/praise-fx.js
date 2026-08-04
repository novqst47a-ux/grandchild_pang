// 칭찬 파티클. 사진 블록을 맞췄을 때 축하 그림 주위로 하트(또는 블록) 파티클이 뜨고,
// 그 뒤로 사각형·원형 폭죽이 퍼진다(기획 §2). 모션은 prototype/photo-block.html의
// `하트` + `모양 등장 & 소멸`(popFade)을 그대로 옮긴 것이다.
//
// 그리기는 게임판 위가 아니라 화면 전체를 덮는 캔버스 한 장에서 한다. 블록 DOM은
// 연쇄가 진행되는 동안 통째로 다시 그려지므로(app.js renderBoard), 그 안에 파티클을 두면
// 다음 렌더에서 사라진다.
import { DEFAULT_BLOCKS, heartPath } from './custom-blocks.js';
import { FIREWORK_COUNT, mainParticleCount } from './praise-settings.js';

const TAU = Math.PI * 2;
const HEART_SIZE = 320;   // 하트 마스크 캔버스 한 변
const HERO_SIZE = 512;    // 메시지 위에 크게 뜨는 한 장. 원본 사진과 같은 크기라 더 키워도 얻는 게 없다
const BLOCK_SIZE = 256;   // 블록 모양 파티클 한 변
const POOL_LIMIT = 96;

let canvas = null;
let ctx = null;
let frameHandle = 0;
let lastTime = 0;
let sourceToken = 0;

const live = [];
const pool = [];
const sources = new Map();  // 블록 자리 → { heart, block, shapes: [사각, 원] }

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'praise-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  fitCanvas();
  addEventListener('resize', fitCanvas);
  // 화면이 가려지면 브라우저가 프레임을 멈춘다. 그대로 두면 몇 분 뒤 돌아왔을 때
  // 그때 터졌어야 할 파티클이 뒤늦게 튀어나온다. 가려질 때 접는다.
  addEventListener('visibilitychange', () => { if (document.hidden) stopPraiseEffects(); });
}

// 캔버스 크기를 바꾸면 그리던 내용이 지워지므로, 정말 달라졌을 때만 다시 맞춘다.
// resize 이벤트만 믿지 않고 터질 때마다 확인한다. 화면 회전처럼 이벤트를 놓치기 쉬운
// 상황에서 캔버스만 옛 크기로 남으면 파티클이 엉뚱한 자리에 그려진다.
function fitCanvas() {
  if (!canvas) return;
  // 고해상도 기기에서 픽셀을 그대로 따라가면 파티클 수십 개에서 프레임이 떨어진다. 2배까지만.
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(innerWidth * ratio);
  const height = Math.round(innerHeight * ratio);
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('praise source unavailable'));
    image.src = dataUrl;
  });
}

// 비율을 지키며 정사각 캔버스를 채운다(CSS의 object-fit: cover와 같은 계산).
function drawCover(target, image, size) {
  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  target.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
}

// 기획 §2.1 — 하트 마스킹은 블록 썸네일이 아니라 프레임 없는 원본 사진에 적용한다.
// 그 사진(customPhotoDataUrl)은 512로 저장되므로 여기서 줄여도 블록(256)보다 촘촘하다.
function buildHeartCanvas(photo, lip, size = HEART_SIZE) {
  const target = document.createElement('canvas');
  target.width = target.height = size;
  const paint = target.getContext('2d');
  const path = heartPath(size / 2, size * .49, size * .86, size * .88);

  // 작은 크기에서도 배경과 분리되어 보이도록 스티커 그림자를 먼저 깐다.
  paint.save();
  paint.translate(0, size * .022);
  paint.shadowColor = 'rgba(58, 16, 36, .32)';
  paint.shadowBlur = size * .04;
  paint.fillStyle = lip;
  paint.fill(path);
  paint.restore();

  paint.save();
  paint.clip(path);
  paint.fillStyle = '#f7ece4';
  paint.fillRect(0, 0, size, size);
  drawCover(paint, photo, size);
  const shine = paint.createLinearGradient(size * .16, size * .12, size * .7, size * .72);
  shine.addColorStop(0, 'rgba(255, 255, 255, .26)');
  shine.addColorStop(.42, 'rgba(255, 255, 255, 0)');
  paint.fillStyle = shine;
  paint.fillRect(0, 0, size, size);
  paint.restore();

  paint.lineJoin = 'round';
  paint.strokeStyle = '#fff8f5';
  paint.lineWidth = size * .068;
  paint.stroke(path);
  paint.strokeStyle = lip;
  paint.lineWidth = size * .026;
  paint.stroke(path);
  return target;
}

function roundedPath(size, radius) {
  const path = new Path2D();
  const end = size - radius;
  path.moveTo(radius, 0);
  path.lineTo(end, 0);
  path.quadraticCurveTo(size, 0, size, radius);
  path.lineTo(size, end);
  path.quadraticCurveTo(size, size, end, size);
  path.lineTo(radius, size);
  path.quadraticCurveTo(0, size, 0, end);
  path.lineTo(0, radius);
  path.quadraticCurveTo(0, 0, radius, 0);
  path.closePath();
  return path;
}

// 기획 §2.1 — 매칭된 블록 모양 그대로의 파티클. 게임판 블록은 네모지만 파티클은
// 프레임 실루엣(토끼·하트…)만 뜬다. 바탕이 없어 배경과 섞이므로 그림자로만 떼어 놓는다.
// 여백은 그림자가 잘리지 않을 만큼만 둔다.
function buildStickerCanvas(image) {
  const pad = Math.round(BLOCK_SIZE * .07);
  const size = BLOCK_SIZE + pad * 2;
  const target = document.createElement('canvas');
  target.width = target.height = size;
  const paint = target.getContext('2d');
  paint.shadowColor = 'rgba(43, 38, 33, .38)';
  paint.shadowBlur = BLOCK_SIZE * .05;
  paint.shadowOffsetY = BLOCK_SIZE * .022;
  paint.drawImage(image, pad, pad, BLOCK_SIZE, BLOCK_SIZE);
  return target;
}

// v3까지 저장된 블록에는 바탕 없는 모양이 없다. 네모난 블록 이미지로 대신하되,
// 게임판 블록과 같은 둥근 모서리로 오려 타일이 통째로 떠오른 것처럼 보이게 한다.
function buildBlockCanvas(image, lip) {
  const size = BLOCK_SIZE;
  const target = document.createElement('canvas');
  target.width = target.height = size;
  const paint = target.getContext('2d');
  const path = roundedPath(size, size * .17);

  paint.save();
  paint.shadowColor = 'rgba(43, 38, 33, .34)';
  paint.shadowBlur = size * .045;
  paint.shadowOffsetY = size * .02;
  paint.fillStyle = lip;
  paint.fill(path);
  paint.restore();

  paint.save();
  paint.clip(path);
  paint.drawImage(image, 0, 0, size, size);
  paint.restore();

  paint.lineJoin = 'round';
  paint.strokeStyle = '#fff8f5';
  paint.lineWidth = size * .055;
  paint.stroke(path);
  paint.strokeStyle = lip;
  paint.lineWidth = size * .022;
  paint.stroke(path);
  return target;
}

// 기획 §2.3 — 사각형 + 원형 도형 폭죽. 맞춘 블록 색을 쓰면 어느 블록이 터졌는지 남는다.
function buildShapeCanvas(kind, [face, lip]) {
  const size = 64;
  const target = document.createElement('canvas');
  target.width = target.height = size;
  const paint = target.getContext('2d');
  const gradient = paint.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, face);
  gradient.addColorStop(1, '#ffffff');
  paint.fillStyle = gradient;
  paint.strokeStyle = lip;
  paint.lineWidth = size * .08;

  const path = new Path2D();
  if (kind === 'rect') {
    const inset = size * .16;
    path.addPath(roundedPath(size * .68, size * .12), new DOMMatrix().translate(inset, inset));
  } else {
    path.arc(size / 2, size / 2, size * .34, 0, TAU);
  }
  paint.fill(path);
  paint.stroke(path);
  return target;
}

// 블록을 바꾸거나 불러올 때마다 파티클 재료를 다시 만들어 둔다.
// 터지는 순간에는 만들 수 없다(이미지 디코딩이 비동기라 한 프레임 늦는다).
export async function updatePraiseSources(images, photos, stickers) {
  const token = ++sourceToken;
  const built = new Map();
  await Promise.all(images.map(async (blockUrl, slot) => {
    if (!blockUrl) return;
    const colors = DEFAULT_BLOCKS[slot].colors;
    const entry = { shapes: [buildShapeCanvas('rect', colors), buildShapeCanvas('circle', colors)] };
    const stickerUrl = stickers?.[slot];
    try {
      entry.block = stickerUrl
        ? buildStickerCanvas(await loadImage(stickerUrl))
        : buildBlockCanvas(await loadImage(blockUrl), colors[1]);
    } catch { /* 파티클만 빠진다 */ }
    const photoUrl = photos?.[slot];
    if (photoUrl) {
      try {
        const photo = await loadImage(photoUrl);
        entry.heart = buildHeartCanvas(photo, colors[1]);
        // 큰 그림은 파티클(약 120px)과 달리 화면의 3분의 1을 차지한다. 같은 캔버스를 늘려 쓰면
        // 흐려지므로 사진 원본 크기 그대로 한 장 더 만든다.
        entry.hero = buildHeartCanvas(photo, colors[1], HERO_SIZE);
      } catch { /* 하트만 빠진다 */ }
    }
    if (entry.block || entry.heart) built.set(slot, entry);
  }));
  // 사이에 새 요청이 들어왔으면 그쪽 결과가 최신이다.
  if (token !== sourceToken) return;
  sources.clear();
  for (const [slot, entry] of built) sources.set(slot, entry);
}

// 하트는 원본 사진이 있어야 만들 수 있다. v2까지 저장된 블록에는 사진이 없어 블록 모양으로 대신한다.
// large는 크게 띄우는 한 장인지다. 하트만 큰 판이 따로 있고, 블록 모양은 한 벌뿐이다.
function pickImage(source, type, large) {
  const heart = (large && source.hero) || source.heart;
  return type === 'HEART_CROP' ? heart || source.block : source.block || heart;
}

// 기획 §2.1 보강 — 축하 메시지 위에 뜨는 큰 그림 한 장. 파티클과 달리 캔버스가 아니라
// DOM에 얹히므로(app.js), 화면에 그릴 캔버스를 그대로 넘긴다. 없으면 null.
export function praiseHeroImage(slot, settings) {
  if (!settings.praiseEffectEnabled) return null;
  const source = sources.get(slot);
  return source ? pickImage(source, settings.praiseParticleType, true) || null : null;
}

function acquire() {
  return pool.pop() || {};
}

function release(particle) {
  particle.img = null;
  if (pool.length < POOL_LIMIT) pool.push(particle);
}

function mainSize() {
  return Math.max(64, Math.min(120, Math.round(Math.min(innerWidth, innerHeight) * .17)));
}

function spawn(values) {
  const particle = acquire();
  Object.assign(particle, { vx: 0, vy: 0, gravity: 0, rot: 0, vr: 0, rise: 0, t: 0, delay: 0, pop: false }, values);
  live.push(particle);
}

// 예약해 둔 프레임 번호를 들고 있다가 멈출 때 취소한다. "도는 중" 표시만 두면
// 그 프레임이 오지 않는 상황(화면이 가려진 채로 접기 등)에서 표시가 참으로 굳어
// 다음 칭찬이 영영 뜨지 않는다.
function start() {
  if (frameHandle) return;
  lastTime = performance.now();
  frameHandle = requestAnimationFrame(step);
}

// 기획 §2.4 — 등장(Scale In + Fade In) → 살짝 떠오름 → 소멸(Scale Out + Fade Out).
// area는 축하 그림이 차지한 자리다. 파티클은 그 둘레(타원) 바깥에 흩어져,
// 그림 뒤에 숨거나 글자를 덮지 않는다. 축하 그림이 가로로 넓으므로 타원도 넓어져
// 좌우로 멀리, 위아래로도 함께 벌어진다.
export function playPraiseEffect({ slot, combo, area, settings }) {
  if (!settings.praiseEffectEnabled) return;
  // 모션을 줄여 달라고 한 사용자에게 화면 가득 파티클을 뿌리지 않는다.
  // 축하 그림과 소리, 진동은 그대로 남으므로 "맞췄다"는 신호는 사라지지 않는다.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const source = sources.get(slot);
  if (!source) return;
  const image = pickImage(source, settings.praiseParticleType, false);
  if (!image) return;

  ensureCanvas();
  fitCanvas();
  const size = mainSize();
  const count = mainParticleCount(combo);
  const edge = size * .75;
  const x = area.left + area.width / 2;
  const y = area.top + area.height / 2;
  // 축하 그림 반지름에 파티클 반지름만큼을 더한 타원. 그림에 닿지 않는 가장 가까운 둘레다.
  const spreadX = area.width / 2 + size * .5;
  const spreadY = area.height / 2 + size * .6;
  // 위(-90°)에서 시작하면 파티클 두 개짜리(1연속)가 위아래 한 줄로만 선다.
  // 왼쪽 위에서 시작해 대각선으로 벌려 좌우도 함께 쓴다.
  const startAngle = -Math.PI * .75;
  for (let index = 0; index < count; index += 1) {
    const angle = startAngle + index * (TAU / count) + (Math.random() - .5) * .3;
    const reach = .95 + Math.random() * .25;
    // 좁은 화면에서는 좌우로 벌린 자리가 화면 밖이라 안쪽으로 당겨진다. 그대로 두면
    // 축하 그림 위에 얹히므로, 당겨진 가로 위치에 맞는 세로 위치를 타원식으로 다시 구해
    // 그림 바깥으로 비켜 준다.
    const placedX = Math.min(innerWidth - edge, Math.max(edge, x + Math.cos(angle) * spreadX * reach));
    const offsetX = Math.min(1, Math.abs(placedX - x) / spreadX);
    const lift = Math.sign(Math.sin(angle)) * spreadY * reach * Math.sqrt(1 - offsetX * offsetX);
    spawn({
      img: image,
      x: placedX,
      y: Math.min(innerHeight - edge, Math.max(edge, y + lift)),
      // 개체마다 1.2~1.5배. 같은 크기로 나오면 도장 찍은 것처럼 보인다.
      size: size * (1.2 + Math.random() * .3),
      rise: 16 + Math.random() * 22,
      ttl: .68 + Math.random() * .34,
      delay: index * .05,
      pop: true,
    });
  }

  if (!settings.fireworksEnabled) { start(); return; }
  for (let index = 0; index < FIREWORK_COUNT; index += 1) {
    const angle = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.8;
    const speed = 190 + Math.random() * 420;
    spawn({
      img: source.shapes[index % 2],
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 900,
      size: 12 + Math.random() * 8,
      rot: Math.random() * TAU,
      vr: (Math.random() - .5) * 8,
      ttl: .6 + Math.random() * .5,
    });
  }
  start();
}

export function stopPraiseEffects() {
  cancelAnimationFrame(frameHandle);
  frameHandle = 0;
  for (const particle of live) release(particle);
  live.length = 0;
  if (ctx) ctx.clearRect(0, 0, innerWidth, innerHeight);
}

function step(now) {
  const delta = Math.min((now - lastTime) / 1000, .05);
  lastTime = now;
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  for (let index = live.length - 1; index >= 0; index -= 1) {
    const particle = live[index];
    if (particle.delay > 0) { particle.delay -= delta; continue; }
    particle.t += delta;
    if (particle.t >= particle.ttl) {
      live.splice(index, 1);
      release(particle);
      continue;
    }

    const progress = particle.t / particle.ttl;
    ctx.save();
    if (particle.pop) {
      // 커지며 팝업 → 잠깐 유지 → 작아지며 소멸. 회전·추락은 없다.
      let scale;
      if (progress < .2) scale = (progress / .2) * 1.15;
      else if (progress < .35) scale = 1.15 - (progress - .2);
      else scale = 1 - Math.max(0, (progress - .72) / .28) * .35;
      ctx.globalAlpha = Math.min(progress / .18, 1) * (progress < .6 ? 1 : 1 - (progress - .6) / .4);
      ctx.translate(particle.x, particle.y - particle.rise * progress);
      const drawn = particle.size * scale;
      ctx.drawImage(particle.img, -drawn / 2, -drawn / 2, drawn, drawn);
    } else {
      particle.vy += particle.gravity * delta;
      particle.vx *= 1 - 1.1 * delta;
      particle.vy *= 1 - .25 * delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.rot += particle.vr * delta;
      ctx.globalAlpha = progress < .6 ? 1 : 1 - (progress - .6) / .4;
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rot);
      const drawn = particle.size * (1 + .25 * Math.sin(Math.PI * progress));
      ctx.drawImage(particle.img, -drawn / 2, -drawn / 2, drawn, drawn);
    }
    ctx.restore();
  }

  if (live.length) {
    frameHandle = requestAnimationFrame(step);
  } else {
    frameHandle = 0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
}
