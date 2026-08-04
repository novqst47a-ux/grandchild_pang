import {
  BOARD_SIZE,
  POINTS_PER_BLOCK,
  START_MOVES,
  areAdjacent,
  collapseBoard,
  findMatches,
  findValidMoves,
  keyOf,
  makeBoard,
  reshuffle,
  swapCells,
} from './game-core.js';
import {
  BADGE_PATHS,
  BLOCK_FORMAT_VERSION,
  DEFAULT_BLOCKS,
  FRAMES,
  customBlockDataUrl,
  customPhotoDataUrl,
  customStickerDataUrl,
  decodePhoto,
  defaultBlockDataUrl,
  drawFramePreview,
  initialTransform,
  loadFrames,
  renderCustomBlock,
  safePresetData,
  samplePhoto,
  upgradeBlockImage,
} from './custom-blocks.js';
import { DEFAULT_PRAISE_SETTINGS, normalizePraiseSettings } from './praise-settings.js';
import { playPraiseEffect, stopPraiseEffects, updatePraiseSources } from './praise-fx.js';
import {
  clearCustomBlocks,
  isStoragePersisted,
  loadCustomBlocks,
  loadPraiseSettings,
  saveCustomBlocks,
  savePraiseSettings,
} from './storage.js';

const $ = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : ms));

const SVG_NS = 'http://www.w3.org/2000/svg';
const LOW_MOVES = 3; // 이 아래로 남으면 남은 이동 카드를 경고 상태로 (DESIGN §5.2)
const TOAST_MS = 2500; // DESIGN §9
const DROP_MS = 400; // .tile.spawned의 --m-slow와 맞춘다. 짧으면 낙하 중에 DOM이 갈린다
const SCORE_COUNT_MS = 400; // §8 --m-slow — 점수 카운트업
const STORAGE_WAIT_MS = 2500; // 저장소를 이만큼 기다렸다가, 늦으면 기본 블록으로 먼저 시작한다
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const boardElement = $('#board');
const scoreValue = $('#scoreValue');
const movesValue = $('#movesValue');
const movesCard = $('#movesCard');
const messageTitle = $('#messageTitle');
const messageText = $('#messageText');
const liveStatus = $('#liveStatus');
const boardOverlay = $('#boardOverlay');
const finalScore = $('#finalScore');
const celebrationPopup = $('#celebrationPopup');
const celebrationImage = $('#celebrationImage');
const CELEBRATIONS = [
  { src: 'assets/celebrations/good.png', alt: '좋아요!' },
  { src: 'assets/celebrations/cool.png', alt: '멋져요!' },
  { src: 'assets/celebrations/amazing.png', alt: '대단해요!' },
];

const defaultImages = DEFAULT_BLOCKS.map((_, index) => defaultBlockDataUrl(index));
let customImages = Array(DEFAULT_BLOCKS.length).fill(null);
// 블록과 짝이 되는 칭찬 파티클 재료. 사진은 하트 마스킹에, 모양은 블록 모양 파티클에 쓴다.
let customPhotos = Array(DEFAULT_BLOCKS.length).fill(null);
let customStickers = Array(DEFAULT_BLOCKS.length).fill(null);
let praiseSettings = { ...DEFAULT_PRAISE_SETTINGS };
let board = makeBoard();
let selected = null;
let busy = false;
let score = 0;
let moves = START_MOVES;
let gameOver = false;
let hintKeys = new Set();
let transientClasses = new Map();
let toastTimer;
let ignoreClickUntil = 0;
let celebrationTimer;

function blockImage(type) { return customImages[type] || defaultImages[type]; }

function setMessage(title, detail = '') {
  messageTitle.textContent = title;
  messageText.textContent = detail;
  liveStatus.textContent = detail ? `${title} ${detail}` : title;
}

// tone은 '' / 'success' / 'danger'. DESIGN §9 — 잘 됐는지 안 됐는지를 색으로도 알린다.
// 1800ms는 어르신이 한 문장을 읽기에 짧다. §9의 2.5초를 쓴다.
function toast(text, tone = '') {
  const element = $('#toast');
  element.textContent = text;
  element.classList.remove('success', 'danger');
  if (tone) element.classList.add(tone);
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), TOAST_MS);
}

// §8 — --m-slow의 용도 중 하나가 점수 카운트업이다. 숫자가 순간이동하면 몇 점이 올랐는지
// 알아채기 어렵다. 400ms 동안 올라가며 눈이 따라가게 한다(계획 A4).
// 연쇄 중에는 이 함수가 연달아 불리므로, 진행 중이던 것을 접고 지금 보이는 값에서 이어 간다.
let scoreFrame = 0;
let shownScore = 0;

function paintScore(value) {
  shownScore = value;
  scoreValue.textContent = value.toLocaleString('ko-KR');
}

function animateScore(target) {
  cancelAnimationFrame(scoreFrame);
  // 새 게임(0으로 되돌리기)까지 굴려서 내리면 점수를 잃은 것처럼 보인다. 내려갈 때는 즉시.
  if (target <= shownScore || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    paintScore(target);
    return;
  }
  const from = shownScore;
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - start) / SCORE_COUNT_MS);
    const eased = 1 - (1 - progress) ** 3; // 처음엔 빠르게, 끝에서 천천히 멈춘다
    paintScore(Math.round(from + (target - from) * eased));
    if (progress < 1) scoreFrame = requestAnimationFrame(step);
  };
  scoreFrame = requestAnimationFrame(step);
}

function updateStats() {
  animateScore(score);
  movesValue.textContent = String(moves);
  const low = !gameOver && moves <= LOW_MOVES;
  movesCard.classList.toggle('low', low);
  // 색만 바꾸면 눈에 띄지 않는다. 줄어들 때마다 한 번씩 튀게 해서 알아채도록 한다.
  movesCard.classList.remove('pulse');
  if (low) { void movesCard.offsetWidth; movesCard.classList.add('pulse'); }
}

// 다섯 블록 면은 밝기가 거의 같아 색만으로는 구분되지 않는다.
// 배지가 실제 구분 수단이므로 폰트에 의존하지 않는 SVG로 그린다(계획 D1-a).
function blockBadge(type) {
  const block = DEFAULT_BLOCKS[type];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'tile-badge');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', BADGE_PATHS[block.shape]);
  path.setAttribute('fill', block.colors[1]);
  svg.append(path);
  return svg;
}

function hideCelebration() {
  clearTimeout(celebrationTimer);
  celebrationPopup.hidden = true;
  celebrationImage.classList.remove('play');
}

function showCelebration(combo) {
  const item = CELEBRATIONS[Math.min(combo, 3) - 1];
  clearTimeout(celebrationTimer);
  celebrationImage.src = item.src;
  celebrationImage.alt = item.alt;
  celebrationPopup.hidden = false;
  celebrationImage.classList.remove('play');
  void celebrationImage.offsetWidth;
  celebrationImage.classList.add('play');
  celebrationTimer = setTimeout(hideCelebration, 860);
}

// 기획 §1 — 칭찬 파티클은 사진 블록을 맞췄을 때만 뜬다. 그림 블록은 축하 그림까지가 전부다.
// 한 번에 여러 종류가 함께 맞아도 파티클은 사진 블록 하나만 고른다. 두 종류가 겹쳐 뜨면
// 무엇을 맞춰서 나온 효과인지 알아보기 어렵다.
function matchedPhotoSlot(matches) {
  for (const key of matches) {
    const [row, col] = key.split(':').map(Number);
    const type = board[row][col];
    if (customImages[type]) return type;
  }
  return null;
}

// 파티클은 축하 그림 둘레에 흩어진다(기획 §2.1 — 메시지 위 또는 주위).
// 그림이 차지한 자리를 그대로 넘겨 그 바깥에 자리를 잡게 한다. 그림이 아직 그려지기
// 전이라 크기를 못 재면 판 전체를 기준으로 삼는다.
function praiseMatched(matches, combo) {
  const slot = matchedPhotoSlot(matches);
  if (slot === null) return;
  const image = celebrationImage.getBoundingClientRect();
  const area = image.width ? image : celebrationPopup.getBoundingClientRect();
  playPraiseEffect({ slot, combo, area, settings: praiseSettings });
}

// DESIGN §9 로딩 — 스피너 대신 판 모양 그대로 25칸. 어디에 무엇이 생길지 미리 보인다.
function renderSkeleton() {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'tile-skeleton';
    cell.setAttribute('aria-hidden', 'true');
    fragment.append(cell);
  }
  boardElement.replaceChildren(fragment);
  boardElement.setAttribute('aria-busy', 'true');
  setMessage('잠깐만요', '블록을 준비하고 있어요');
}

function renderBoard() {
  const focusKey = document.activeElement?.dataset?.key;
  const fragment = document.createDocumentFragment();
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const type = board[row][col];
      const key = keyOf(row, col);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `tile ${transientClasses.get(key) || ''}`.trim();
      button.dataset.row = row;
      button.dataset.col = col;
      button.dataset.key = key;
      button.dataset.selected = String(selected?.row === row && selected?.col === col);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-rowindex', String(row + 1));
      button.setAttribute('aria-colindex', String(col + 1));
      button.setAttribute('aria-label', `${row + 1}행 ${col + 1}열, ${DEFAULT_BLOCKS[type].spoken}${button.dataset.selected === 'true' ? ', 선택됨' : ''}`);
      button.setAttribute('aria-selected', button.dataset.selected);
      button.disabled = busy || gameOver;
      button.style.setProperty('--tile-lip', DEFAULT_BLOCKS[type].colors[1]);
      if (hintKeys.has(key)) button.classList.add('hint');
      const image = document.createElement('img');
      image.className = 'tile-visual';
      image.src = blockImage(type);
      image.alt = '';
      image.draggable = false;
      button.append(image, blockBadge(type));
      button.addEventListener('click', () => {
        if (performance.now() < ignoreClickUntil) return;
        chooseTile({ row, col });
      });
      button.addEventListener('keydown', (event) => handleTileKey(event, { row, col }));
      fragment.append(button);
    }
  }
  boardElement.replaceChildren(fragment);
  boardElement.setAttribute('aria-busy', String(busy));
  // §9 연쇄 처리 중 — 판 전체를 못 누르게 하고 살짝 어둡게. 문구는 띄우지 않는다.
  boardElement.classList.toggle('busy', busy);
  if (focusKey) boardElement.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
}

function handleTileKey(event, position) {
  const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (!(event.key in directions)) return;
  event.preventDefault();
  const [dr, dc] = directions[event.key];
  const target = { row: Math.max(0, Math.min(BOARD_SIZE - 1, position.row + dr)), col: Math.max(0, Math.min(BOARD_SIZE - 1, position.col + dc)) };
  boardElement.querySelector(`[data-key="${keyOf(target.row, target.col)}"]`)?.focus();
}

async function chooseTile(position) {
  if (busy || gameOver) return;
  hintKeys.clear();
  if (!selected) {
    selected = position;
    setMessage(`${DEFAULT_BLOCKS[board[position.row][position.col]].name} 블록을 골랐어요`, '옆에 있는 블록을 눌러 보세요');
    playTone(330, .04);
    renderBoard();
    return;
  }
  if (selected.row === position.row && selected.col === position.col) {
    selected = null;
    setMessage('다시 고를 수 있어요', '옮길 블록을 눌러 보세요');
    renderBoard();
    return;
  }
  if (!areAdjacent(selected, position)) {
    selected = position;
    setMessage('이 블록을 골랐어요', '바로 옆 블록하고만 바꿀 수 있어요');
    renderBoard();
    return;
  }
  await trySwap(selected, position);
}

async function trySwap(from, to) {
  busy = true;
  selected = null;
  const original = board;
  board = swapCells(board, from, to);
  transientClasses = new Map([[keyOf(from.row, from.col), 'spawned'], [keyOf(to.row, to.col), 'spawned']]);
  renderBoard();
  await sleep(190);
  const matches = findMatches(board);
  if (!matches.size) {
    board = original;
    transientClasses = new Map([[keyOf(from.row, from.col), 'invalid'], [keyOf(to.row, to.col), 'invalid']]);
    setMessage('여기는 안 움직여요', '다른 곳을 눌러 보세요. 이동 횟수는 그대로예요');
    playTone(145, .09);
    navigator.vibrate?.(20); // 소리를 끈 어르신에게도 피드백이 남도록(계획 A6)
    renderBoard();
    await sleep(320);
    busy = false;
    transientClasses.clear();
    renderBoard();
    return;
  }

  moves -= 1;
  updateStats();
  await processMatches();
  if (moves <= 0) {
    endGame();
  } else {
    if (!findValidMoves(board).length) {
      setMessage('새로 섞어 드릴게요', '맞출 수 있는 자리를 만들고 있어요');
      await sleep(450);
      board = reshuffle(board);
      transientClasses = new Map(board.flatMap((_, row) => board[row].map((__, col) => [keyOf(row, col), 'spawned'])));
      renderBoard();
      await sleep(DROP_MS);
    }
    busy = false;
    transientClasses.clear();
    renderBoard();
  }
}

async function processMatches() {
  let combo = 0;
  while (true) {
    const matches = findMatches(board);
    if (!matches.size) break;
    combo += 1;
    const gained = matches.size * POINTS_PER_BLOCK * combo;
    score += gained;
    updateStats();
    transientClasses = new Map([...matches].map((key) => [key, 'matched']));
    const title = combo > 1 ? `${combo}번 연속! 대단해요` : `잘했어요! ${matches.size}개 모았어요`;
    setMessage(title, `+${gained.toLocaleString('ko-KR')}점`);
    showCelebration(combo);
    praiseMatched(matches, combo);
    playMatchSound(combo);
    navigator.vibrate?.(combo > 1 ? [35, 35, 55] : 35);
    renderBoard();
    await sleep(300);
    const collapsed = collapseBoard(board, matches);
    board = collapsed.board;
    transientClasses = new Map([...collapsed.spawned].map((key) => [key, 'spawned']));
    renderBoard();
    await sleep(DROP_MS);
  }
}

function startGame() {
  board = makeBoard();
  selected = null;
  busy = false;
  score = 0;
  moves = START_MOVES;
  gameOver = false;
  hintKeys.clear();
  transientClasses.clear();
  boardOverlay.hidden = true;
  hideCelebration();
  stopPraiseEffects();
  updateStats();
  setMessage('같은 그림 3개를 모아 보세요', '블록을 누르고, 옆 블록을 눌러 보세요');
  renderBoard();
}

function endGame() {
  busy = false;
  gameOver = true;
  updateStats(); // 경고 상태를 해제한다. 게임이 끝난 뒤까지 빨갛게 둘 이유가 없다
  finalScore.textContent = `${score.toLocaleString('ko-KR')}점`;
  boardOverlay.hidden = false;
  setMessage('오늘은 여기까지! 참 잘했어요', `${score.toLocaleString('ko-KR')}점이에요`);
  playMatchSound(3);
  renderBoard();
  $('#restartButton').focus();
}

function showHint() {
  if (busy || gameOver) return;
  const move = findValidMoves(board)[0];
  if (!move) return;
  hintKeys = new Set(move.map(({ row, col }) => keyOf(row, col)));
  setMessage('여기를 옮겨 보세요', '힌트는 이동 횟수를 쓰지 않아요');
  renderBoard();
  setTimeout(() => { hintKeys.clear(); renderBoard(); }, 1800);
}

let swipeStart = null;
let dragGhost = null;

function moveDragGhost(x, y) {
  if (!dragGhost) return;
  dragGhost.style.left = `${x}px`;
  dragGhost.style.top = `${y}px`;
}

function beginDrag(event) {
  if (!swipeStart || swipeStart.dragging) return;
  swipeStart.dragging = true;
  swipeStart.tile.classList.add('drag-source');
  dragGhost = document.createElement('img');
  dragGhost.className = 'drag-ghost';
  dragGhost.src = blockImage(board[swipeStart.row][swipeStart.col]);
  dragGhost.alt = '';
  dragGhost.setAttribute('aria-hidden', 'true');
  dragGhost.style.setProperty('--drag-size', `${swipeStart.size}px`);
  document.body.append(dragGhost);
  moveDragGhost(event.clientX, event.clientY);
  ignoreClickUntil = performance.now() + 450;
}

function finishDrag() {
  swipeStart?.tile?.classList.remove('drag-source');
  dragGhost?.remove();
  dragGhost = null;
}

boardElement.addEventListener('pointerdown', (event) => {
  const tile = event.target.closest('.tile');
  if (!tile || busy || gameOver) return;
  const bounds = tile.getBoundingClientRect();
  swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY, row: Number(tile.dataset.row), col: Number(tile.dataset.col), tile, size: bounds.width, dragging: false };
  boardElement.setPointerCapture?.(event.pointerId);
});
boardElement.addEventListener('pointermove', (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId || busy || gameOver) return;
  const distance = Math.hypot(event.clientX - swipeStart.x, event.clientY - swipeStart.y);
  if (distance > 7) beginDrag(event);
  if (swipeStart.dragging) {
    event.preventDefault();
    moveDragGhost(event.clientX, event.clientY);
  }
}, { passive: false });
boardElement.addEventListener('pointerup', (event) => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const dx = event.clientX - swipeStart.x;
  const dy = event.clientY - swipeStart.y;
  const source = { row: swipeStart.row, col: swipeStart.col };
  const wasDragging = swipeStart.dragging;
  finishDrag();
  swipeStart = null;
  if (!busy && !gameOver && wasDragging && Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
    const target = { row: source.row + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0), col: source.col + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0) };
    if (target.row >= 0 && target.row < BOARD_SIZE && target.col >= 0 && target.col < BOARD_SIZE) {
      ignoreClickUntil = performance.now() + 350;
      trySwap(source, target);
    }
  }
});
boardElement.addEventListener('pointercancel', () => { finishDrag(); swipeStart = null; });

// 확인 다이얼로그. 네이티브 window.confirm은 문구·색·포커스를 제어할 수 없고
// WebView에서 시스템 폰트로 튀어나와 톤이 깨진다(DESIGN §9). 두 곳이 이 하나를 나눠 쓴다.
const confirmDialog = $('#confirmDialog');
let settleConfirm = null;

// 답이 하나 나오면 끝이다. 두 번 불려도(닫기 버튼 뒤에 close 이벤트가 따라오는 등)
// 처음 값만 쓰고 나머지는 흘린다.
function settleConfirmWith(answer) {
  const resolve = settleConfirm;
  settleConfirm = null;
  resolve?.(answer);
}

function askConfirm({ icon = '↻', title, text, confirmLabel, cancelLabel }) {
  settleConfirmWith(false); // 앞의 물음이 남아 있으면 취소로 접는다
  $('#confirmIcon').textContent = icon;
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  $('#confirmOkButton').textContent = confirmLabel;
  $('#confirmCancelButton').textContent = cancelLabel;
  confirmDialog.showModal();
  $('#confirmCancelButton').focus(); // §9 — 기본 포커스는 취소. 연타로 되돌릴 수 없게 되면 안 된다
  return new Promise((resolve) => { settleConfirm = resolve; });
}

// 답은 버튼 핸들러에서 바로 정한다. dialog의 close 이벤트에 기대면 그 이벤트를 흘리는
// WebView에서 물음이 영영 끝나지 않아 되돌리기·새 게임이 조용히 멈춘다.
// cancel/close는 Esc·백드롭으로 닫힌 경우만 받는 안전망이다.
$('#confirmCancelButton').addEventListener('click', () => { confirmDialog.close(); settleConfirmWith(false); });
$('#confirmOkButton').addEventListener('click', () => { confirmDialog.close(); settleConfirmWith(true); });
confirmDialog.addEventListener('cancel', () => settleConfirmWith(false));
confirmDialog.addEventListener('close', () => settleConfirmWith(false));

$('#hintButton').addEventListener('click', showHint);
$('#restartButton').addEventListener('click', startGame);
$('#newGameButton').addEventListener('click', async () => {
  const ok = await askConfirm({
    icon: '↻',
    title: '새 게임을 시작할까요?',
    text: '지금 점수는 사라지고 처음부터 시작해요',
    confirmLabel: '새 게임',
    cancelLabel: '계속하기',
  });
  if (ok) startGame();
});

let muted = false;
let audioContext;
function playTone(frequency, duration, delay = 0) {
  if (muted) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, audioContext.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(.055, audioContext.currentTime + delay + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + delay + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(audioContext.currentTime + delay); oscillator.stop(audioContext.currentTime + delay + duration + .02);
  } catch { /* audio is optional */ }
}
function playMatchSound(combo) {
  playTone(440 + combo * 55, .13);
  playTone(610 + combo * 70, .16, .09);
}
$('#soundButton').addEventListener('click', () => {
  muted = !muted;
  $('#soundButton').setAttribute('aria-pressed', String(muted));
  $('#soundButton').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
  $('#soundButton').firstElementChild.textContent = muted ? '🔇' : '🔊';
  toast(muted ? '소리를 껐어요' : '소리를 켰어요');
  if (!muted) playTone(440, .08);
});

// 커스텀 블록 편집기: 사진은 메모리에만 두고, 사용자가 내보낸 프리셋 파일만 기기에 남긴다.
// 모달은 한 번에 한 스텝만 보여 준다(DESIGN §6.1). 화면에 무엇이 보이는지는 editorStep 하나로 정해진다.
const settingsDialog = $('#settingsDialog');
const cropCanvas = $('#cropCanvas');
const cropContext = cropCanvas.getContext('2d');
const STEPS = {
  1: { title: '어떤 블록을 바꿀까요?', action: '다음' },
  2: { title: '사진을 골라 주세요', action: '다음' },
  3: { title: '사진을 맞춰 볼까요?', action: '이 사진으로 할게요' },
  done: { title: '다 됐어요!', action: '게임으로 돌아가기' },
};
let editorStep = 1;
let editorSlot = 0;
let editorFrame = null;
let editorImage = null;
let editorTransform = { x: 0, y: 0, scale: 1, baseScale: 1 };
let holeScale = .82;
let sampleSeed = 0;
let storageQueue = Promise.resolve();

function persistCustomImages() {
  const blocks = [...customImages];
  const photos = [...customPhotos];
  const stickers = [...customStickers];
  updatePraiseSources(blocks, photos, stickers);
  storageQueue = storageQueue.catch(() => {}).then(() => saveCustomBlocks(blocks, photos, stickers));
  return storageQueue;
}

// 예전 방식으로 합성된 블록을 슬롯 바탕 위에 다시 얹는다(계획 D2-a).
// 한 장이 실패해도 나머지는 올린다. 실패한 블록은 예전 모습으로 남을 뿐 게임은 돌아간다.
async function upgradeStoredBlocks() {
  customImages = await Promise.all(
    customImages.map((value, slot) => (value ? upgradeBlockImage(value, slot).catch(() => value) : null)),
  );
}

function renderSlots() {
  const list = $('#slotList');
  const fragment = document.createDocumentFragment();
  DEFAULT_BLOCKS.forEach((block, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'choice-card'; button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(index === editorSlot));
    button.setAttribute('aria-label', `${block.name} 블록${customImages[index] ? ', 사진 적용됨' : ', 기본 블록'}`);
    const image = new Image(); image.src = blockImage(index); image.alt = '';
    const label = document.createElement('span'); label.textContent = block.name;
    button.append(image, label);
    button.addEventListener('click', () => { editorSlot = index; renderSlots(); renderStep(); });
    fragment.append(button);
  });
  list.replaceChildren(fragment);
}

function renderFrames() {
  const list = $('#frameList');
  if (!FRAMES.length) {
    list.textContent = '프레임을 준비하고 있어요';
    return;
  }
  const fragment = document.createDocumentFragment();
  FRAMES.forEach((frame) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'choice-card'; button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(frame.id === editorFrame?.id));
    button.setAttribute('aria-label', `${frame.name} 모양`);
    const canvas = document.createElement('canvas'); drawFramePreview(canvas, frame);
    const label = document.createElement('span'); label.textContent = frame.name;
    button.append(canvas, label);
    button.addEventListener('click', () => { editorFrame = frame; renderFrames(); renderCrop(); });
    fragment.append(button);
  });
  list.replaceChildren(fragment);
}

function renderCrop() {
  if (!editorFrame) {
    cropContext.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    return;
  }
  renderCustomBlock(cropContext, cropCanvas.width, { frame: editorFrame, holeScale, image: editorImage, transform: editorTransform, cropGuide: true, slot: editorSlot });
}

// 스텝 2는 "사진을 골랐다"는 사실만 확인하면 된다. 프레임을 씌우지 않은 원본을 그대로 보여 준다.
function renderPhotoPreview() {
  const canvas = $('#photoPreviewCanvas');
  canvas.hidden = !editorImage;
  $('#photoEmpty').hidden = Boolean(editorImage);
  if (!editorImage) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(canvas.width / editorImage.width, canvas.height / editorImage.height);
  const width = editorImage.width * scale;
  const height = editorImage.height * scale;
  ctx.drawImage(editorImage, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
}

function renderStep() {
  const step = STEPS[editorStep];
  const numbered = editorStep === 'done' ? 3 : editorStep;
  for (const panel of settingsDialog.querySelectorAll('.step-panel')) {
    panel.classList.toggle('active', panel.dataset.step === String(editorStep));
  }
  $('#settingsTitle').textContent = step.title;
  $('#stepCount').textContent = editorStep === 'done' ? '끝났어요' : `${numbered} / 3`;
  $('#stepProgress').setAttribute('aria-valuenow', String(numbered));
  $('#stepProgressFill').style.width = `${Math.round((numbered / 3) * 100)}%`;
  $('#stepBackButton').hidden = editorStep === 1 || editorStep === 'done';

  // §9 사진 적용 대기 — 버튼을 감추지 않고 비활성 스타일로 두고, 무엇이 필요한지 한 줄로 알린다.
  const waitingForPhoto = editorStep === 2 && !editorImage;
  const next = $('#stepNextButton');
  next.textContent = step.action;
  next.disabled = waitingForPhoto;
  $('#stepNote').hidden = !waitingForPhoto;
  $('#stepNote').textContent = waitingForPhoto ? '사진을 먼저 골라 주세요' : '';

  // 되돌리기는 스텝 1에서, 그 자리에 사진이 들어 있을 때만 보여 준다.
  $('#restoreSlotButton').hidden = !(editorStep === 1 && customImages[editorSlot]);

  if (editorStep === 2) renderPhotoPreview();
  if (editorStep === 3) { renderOrientation(); renderCrop(); }
}

function goStep(step) {
  editorStep = step;
  renderStep();
  $('#settingsBody').scrollTop = 0;
}

function setEditorImage(image) {
  if (editorImage && editorImage !== image) editorImage.close?.();
  editorImage = image;
  editorTransform = initialTransform(image);
  $('#zoomRange').value = '100';
  $('#zoomOutput').textContent = '100%';
  renderOrientation();
  renderCrop();
  renderStep();
}

function renderOrientation() {
  $('#flipPhotoButton').setAttribute('aria-pressed', String(Boolean(editorTransform.flip)));
}

// 뒤집힌 사진은 화면에 거울처럼 보인다. 각도를 그대로 더하면 "오른쪽으로"를 눌렀을 때
// 왼쪽으로 도는 것처럼 보이므로, 뒤집혀 있을 때는 부호를 뒤집어 화면과 버튼을 맞춘다.
function turnPhoto(degrees) {
  if (!editorImage) return;
  const step = editorTransform.flip ? -degrees : degrees;
  editorTransform.rotation = (((editorTransform.rotation || 0) + step) % 360 + 360) % 360;
  renderCrop();
}

async function usePhotoFile(file) {
  if (!file) return;
  try {
    setEditorImage(await decodePhoto(file));
    toast('사진을 불러왔어요', 'success');
  } catch {
    toast('사진을 읽지 못했어요. 다른 사진으로 해볼까요?', 'danger');
  }
}

async function applyToSlot() {
  if (!editorImage || !editorFrame) return;
  const slot = editorSlot;
  const shaped = { frame: editorFrame, holeScale, image: editorImage, transform: editorTransform };
  customImages[slot] = customBlockDataUrl({ ...shaped, slot });
  // 블록과 함께 칭찬 파티클 재료 두 장도 남긴다.
  // 사진은 프레임 없이(하트 마스킹용), 모양은 바탕 없이(블록 모양 파티클용).
  customPhotos[slot] = customPhotoDataUrl({ image: editorImage, transform: editorTransform });
  customStickers[slot] = customStickerDataUrl(shaped);
  renderSlots();
  renderBoard();
  $('#donePreview').src = customImages[slot];
  $('#doneMessage').textContent = `${DEFAULT_BLOCKS[slot].name} 블록이 바뀌었어요`;
  goStep('done');
  try {
    await persistCustomImages();
  } catch { toast('블록은 바꿨지만 저장은 못 했어요', 'danger'); }
}

$('#openSettingsButton').disabled = true;
$('#openSettingsButton').addEventListener('click', () => {
  if (!editorFrame) return;
  renderSlots();
  renderFrames();
  goStep(1); // 모달은 늘 첫 스텝에서 시작한다. 지난번 어디까지 갔는지 기억하면 오히려 헷갈린다
  settingsDialog.showModal();
});
$('#closeSettingsButton').addEventListener('click', () => settingsDialog.close());
$('#stepBackButton').addEventListener('click', () => { if (editorStep === 3) goStep(2); else if (editorStep === 2) goStep(1); });
$('#continueDecorateButton').addEventListener('click', () => goStep(1));
$('#stepNextButton').addEventListener('click', () => {
  if (editorStep === 1) goStep(2);
  else if (editorStep === 2) { if (editorImage) goStep(3); }
  else if (editorStep === 3) applyToSlot();
  else settingsDialog.close();
});
$('#cameraButton').addEventListener('click', () => $('#cameraInput').click());
$('#galleryButton').addEventListener('click', () => $('#galleryInput').click());
$('#cameraInput').addEventListener('change', (event) => { usePhotoFile(event.target.files[0]); event.target.value = ''; });
$('#galleryInput').addEventListener('change', (event) => { usePhotoFile(event.target.files[0]); event.target.value = ''; });
$('#sampleButton').addEventListener('click', () => setEditorImage(samplePhoto(sampleSeed++)));
// 가운데로 다시는 위치와 크기만 되돌린다. 방향까지 되돌리면 옆으로 누운 사진을
// 애써 세워 둔 것이 한 번에 사라진다.
$('#resetCropButton').addEventListener('click', () => {
  if (!editorImage) return;
  editorTransform = initialTransform(editorImage, editorTransform);
  $('#zoomRange').value = '100';
  $('#zoomOutput').textContent = '100%';
  renderCrop();
});
$('#turnLeftButton').addEventListener('click', () => turnPhoto(-90));
$('#turnRightButton').addEventListener('click', () => turnPhoto(90));
$('#flipPhotoButton').addEventListener('click', () => {
  if (!editorImage) return;
  editorTransform.flip = !editorTransform.flip;
  renderOrientation();
  renderCrop();
});

$('#zoomRange').addEventListener('input', (event) => {
  if (!editorImage) return;
  const zoom = Number(event.target.value) / 100;
  editorTransform.scale = editorTransform.baseScale * zoom;
  $('#zoomOutput').textContent = `${event.target.value}%`;
  renderCrop();
});
$('#holeRange').addEventListener('input', (event) => {
  holeScale = Number(event.target.value) / 100;
  $('#holeOutput').textContent = `${event.target.value}%`;
  renderCrop();
});

// §6.5 — 손잡이를 끌기 어려운 손을 위한 대체 조작. 값 변경은 위 input 핸들러가 그대로 받는다.
for (const button of document.querySelectorAll('.stepper')) {
  button.addEventListener('click', () => {
    const input = $(`#${button.dataset.range}`);
    const next = Math.min(Number(input.max), Math.max(Number(input.min), Number(input.value) + Number(button.dataset.delta)));
    if (String(next) === input.value) return;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const cropPointers = new Map();
let cropGesture = null;
let cropLast = null;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function resetCropGesture() {
  const points = [...cropPointers.values()];
  cropLast = points.length === 1 ? { ...points[0] } : null;
  cropGesture = points.length >= 2 ? { distance: distance(points[0], points[1]), scale: editorTransform.scale } : null;
}
cropCanvas.addEventListener('pointerdown', (event) => {
  if (!editorImage) return;
  cropCanvas.setPointerCapture(event.pointerId);
  cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  resetCropGesture();
});
cropCanvas.addEventListener('pointermove', (event) => {
  if (!cropPointers.has(event.pointerId)) return;
  event.preventDefault();
  cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = [...cropPointers.values()];
  const scale = 256 / cropCanvas.getBoundingClientRect().width;
  if (points.length === 1 && cropLast) {
    editorTransform.x += (points[0].x - cropLast.x) * scale;
    editorTransform.y += (points[0].y - cropLast.y) * scale;
    cropLast = { ...points[0] };
  } else if (points.length >= 2 && cropGesture) {
    const zoom = Math.max(.7, Math.min(5, (cropGesture.scale * distance(points[0], points[1]) / Math.max(1, cropGesture.distance)) / editorTransform.baseScale));
    editorTransform.scale = editorTransform.baseScale * zoom;
    $('#zoomRange').value = String(Math.round(zoom * 100));
    $('#zoomOutput').textContent = `${Math.round(zoom * 100)}%`;
  }
  renderCrop();
}, { passive: false });
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  cropCanvas.addEventListener(eventName, (event) => { cropPointers.delete(event.pointerId); resetCropGesture(); });
}

$('#restoreSlotButton').addEventListener('click', async () => {
  customImages[editorSlot] = null;
  customPhotos[editorSlot] = null;
  customStickers[editorSlot] = null;
  renderSlots(); renderBoard(); renderStep();
  try {
    await persistCustomImages();
    toast('그림 블록으로 되돌렸어요', 'success');
  } catch { toast('블록은 되돌렸지만 저장은 못 했어요', 'danger'); }
});

$('#exportPresetButton').addEventListener('click', () => {
  if (!customImages.some(Boolean)) { toast('먼저 사진 블록을 하나 만들어 보세요'); return; }
  const blob = new Blob([JSON.stringify({ app: 'sonjupang', version: BLOCK_FORMAT_VERSION, savedAt: new Date().toISOString(), blocks: customImages, photos: customPhotos, stickers: customStickers })], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `sonjupang-blocks-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('꾸민 모습을 파일로 저장했어요', 'success');
});
$('#importPresetButton').addEventListener('click', () => $('#presetInput').click());
$('#presetInput').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0];
    if (!file || file.size > 30_000_000) throw new Error('too large');
    const preset = safePresetData(JSON.parse(await file.text()));
    customImages = preset.blocks;
    customPhotos = preset.photos;
    customStickers = preset.stickers;
    // v1만 합성 방식이 다르다. 그 뒤 판 올림은 파티클 재료가 함께 저장되는지의 차이라
    // 블록 이미지를 다시 얹을 것이 없다.
    if (preset.version < 2) await upgradeStoredBlocks();
    renderSlots(); renderBoard(); renderStep();
    await persistCustomImages();
    toast('꾸민 모습을 불러왔어요', 'success');
  } catch { toast('이 파일은 열 수 없어요. 다른 파일로 해볼까요?', 'danger'); }
  event.target.value = '';
});

$('#resetCustomBlocksButton').addEventListener('click', async () => {
  if (!customImages.some(Boolean)) { toast('되돌릴 사진 블록이 없어요'); return; }
  const ok = await askConfirm({
    icon: '↺',
    title: '모두 처음으로 되돌릴까요?',
    text: '꾸며 둔 사진 블록이 모두 그림 블록으로 돌아가요',
    confirmLabel: '되돌리기',
    cancelLabel: '그만두기',
  });
  if (!ok) return;
  try {
    await storageQueue.catch(() => {});
    await clearCustomBlocks();
    customImages = Array(DEFAULT_BLOCKS.length).fill(null);
    customPhotos = Array(DEFAULT_BLOCKS.length).fill(null);
    customStickers = Array(DEFAULT_BLOCKS.length).fill(null);
    updatePraiseSources(customImages, customPhotos, customStickers);
    renderSlots(); renderBoard(); renderStep();
    toast('모두 그림 블록으로 되돌렸어요', 'success');
  } catch { toast('저장된 블록을 되돌리지 못했어요', 'danger'); }
});

// ── 칭찬 효과 설정 (기획 §3) ──
// 값은 사진과 따로 저장한다. 저장에 실패해도 이번 판에서는 그대로 적용되고,
// 다음에 열 때 기본값으로 돌아갈 뿐이라 게임이 막히지 않는다.
const praiseEffectToggle = $('#praiseEffectToggle');
const fireworksToggle = $('#fireworksToggle');
const praiseTypeButtons = [...$('#praiseTypeGroup').querySelectorAll('[role="radio"]')];

function paintToggle(button, on) {
  button.setAttribute('aria-checked', String(on));
  button.querySelector('.toggle-state').textContent = on ? '켜짐' : '꺼짐';
}

function renderPraiseSettings() {
  const on = praiseSettings.praiseEffectEnabled;
  paintToggle(praiseEffectToggle, on);
  paintToggle(fireworksToggle, praiseSettings.fireworksEnabled);
  // 칭찬 효과를 끄면 딸린 설정 두 개는 손댈 수 없다(기획 §4.3).
  fireworksToggle.disabled = !on;
  for (const button of praiseTypeButtons) {
    button.setAttribute('aria-checked', String(button.dataset.value === praiseSettings.praiseParticleType));
    button.disabled = !on;
  }
}

function changePraiseSettings(patch) {
  praiseSettings = normalizePraiseSettings({ ...praiseSettings, ...patch });
  renderPraiseSettings();
  savePraiseSettings(praiseSettings).catch(() => toast('효과는 바꿨지만 저장은 못 했어요', 'danger'));
}

praiseEffectToggle.addEventListener('click', () => {
  changePraiseSettings({ praiseEffectEnabled: !praiseSettings.praiseEffectEnabled });
  toast(praiseSettings.praiseEffectEnabled ? '칭찬 효과를 켰어요' : '칭찬 효과를 껐어요', 'success');
});
fireworksToggle.addEventListener('click', () => {
  changePraiseSettings({ fireworksEnabled: !praiseSettings.fireworksEnabled });
});
for (const button of praiseTypeButtons) {
  button.addEventListener('click', () => changePraiseSettings({ praiseParticleType: button.dataset.value }));
}

async function loadPraiseOptions() {
  try {
    praiseSettings = normalizePraiseSettings(await loadPraiseSettings());
  } catch {
    praiseSettings = { ...DEFAULT_PRAISE_SETTINGS };
  }
  renderPraiseSettings();
}

settingsDialog.addEventListener('close', () => $('#openSettingsButton').focus());

// 개발 서버에서는 등록하지 않는다. sw.js가 src/*.js까지 캐시하므로, 등록해 두면
// 코드를 고쳐도 새로고침한 화면이 바뀌지 않는다. 번들러를 걷어내면서 빌드 시점 플래그
// (import.meta.env.PROD)가 없어졌으므로 호스트 이름으로 판별한다.
const isLocalHost = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
if (!isLocalHost && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

async function loadStoredBlocks() {
  try {
    const stored = await loadCustomBlocks();
    customImages = stored.blocks;
    customPhotos = stored.photos;
    customStickers = stored.stickers;
    if (stored.version < 2 && customImages.some(Boolean)) {
      await upgradeStoredBlocks();
      await persistCustomImages().catch(() => {});
    } else {
      updatePraiseSources(customImages, customPhotos, customStickers);
    }
    // 홈 화면에 설치하면 저장 공간이 부족해도 사진이 지워지지 않는다(storage.js 참고).
    // 설치 전에는 축출될 수 있으므로 같은 말을 하면 안 된다.
    $('#storageStatus').textContent = await isStoragePersisted()
      ? '사진은 이 기기에만 저장돼요. 지우기 전까지 그대로 있어요'
      : '사진은 이 브라우저에만 저장돼요. 인터넷으로 보내지 않아요';
  } catch {
    $('#storageStatus').textContent = '자동 저장이 안 돼요. 꾸민 모습 저장하기를 써 보세요';
  }
}

async function initializeApp() {
  renderSkeleton();
  renderPraiseSettings();
  loadPraiseOptions();
  renderFrames();
  renderCrop();
  loadFrames().then(() => {
    editorFrame = FRAMES[0];
    renderFrames();
    renderCrop();
    $('#openSettingsButton').disabled = false;
  }).catch((error) => {
    console.error(error);
    $('#frameList').textContent = '프레임을 준비하지 못했어요';
    $('#openSettingsButton').title = '프레임 파일을 확인해 주세요';
  });
  // startGame()을 먼저 부르면 그림 블록으로 한 판을 그린 뒤 사진 블록으로 다시 그려
  // 첫 화면이 한 번 깜빡인다. 저장소를 읽고 나서 시작해 그 깜빡임을 없앤다(DESIGN §9).
  let started = false;
  const ready = loadStoredBlocks().then(() => {
    // 아래 race가 타임아웃으로 끝난 뒤에 사진이 도착한 경우에만 다시 그린다.
    if (started) { renderSlots(); renderBoard(); }
  });
  // 저장소가 늦거나 응답하지 않아도 게임은 시작돼야 한다. 스켈레톤에 갇히면 아무것도 못 한다.
  await Promise.race([ready, wait(STORAGE_WAIT_MS)]);
  started = true;
  renderSlots();
  startGame();
}

initializeApp();
