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
  decodePhoto,
  defaultBlockDataUrl,
  drawFramePreview,
  initialTransform,
  renderCustomBlock,
  safePresetData,
  samplePhoto,
  upgradeBlockImage,
} from './custom-blocks.js';
import { clearCustomBlocks, loadCustomBlocks, saveCustomBlocks, storageKind } from './storage.js';

const $ = (selector) => document.querySelector(selector);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : ms));

const SVG_NS = 'http://www.w3.org/2000/svg';
const LOW_MOVES = 3; // 이 아래로 남으면 남은 이동 카드를 경고 상태로 (DESIGN §5.2)

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

function toast(text) {
  const element = $('#toast');
  element.textContent = text;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 1800);
}

function updateStats() {
  scoreValue.textContent = score.toLocaleString('ko-KR');
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
    setMessage(`${DEFAULT_BLOCKS[board[position.row][position.col]].name} 블록 선택`, '바꿀 옆 블록을 눌러주세요.');
    playTone(330, .04);
    renderBoard();
    return;
  }
  if (selected.row === position.row && selected.col === position.col) {
    selected = null;
    setMessage('선택을 취소했어요', '옮길 블록을 다시 눌러주세요.');
    renderBoard();
    return;
  }
  if (!areAdjacent(selected, position)) {
    selected = position;
    setMessage('새 블록을 선택했어요', '바로 옆 블록과 바꿀 수 있어요.');
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
    setMessage('이 자리에서는 모이지 않아요', '다른 옆 블록과 바꿔보세요. 이동 횟수는 그대로예요.');
    playTone(145, .09);
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
      setMessage('새로 섞어드릴게요', '맞출 수 있는 자리를 만드는 중이에요.');
      await sleep(450);
      board = reshuffle(board);
      transientClasses = new Map(board.flatMap((_, row) => board[row].map((__, col) => [keyOf(row, col), 'spawned'])));
      renderBoard();
      await sleep(350);
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
    const title = combo > 1 ? `${combo}연속! 정말 잘했어요!` : `${matches.size}개를 모았어요!`;
    setMessage(title, `+${gained.toLocaleString('ko-KR')}점`);
    showCelebration(combo);
    playMatchSound(combo);
    navigator.vibrate?.(combo > 1 ? [35, 35, 55] : 35);
    renderBoard();
    await sleep(300);
    const collapsed = collapseBoard(board, matches);
    board = collapsed.board;
    transientClasses = new Map([...collapsed.spawned].map((key) => [key, 'spawned']));
    renderBoard();
    await sleep(350);
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
  updateStats();
  setMessage('같은 블록 3개를 모아보세요!', '블록을 누른 뒤 옆 블록을 누르세요.');
  renderBoard();
}

function endGame() {
  busy = false;
  gameOver = true;
  updateStats(); // 경고 상태를 해제한다. 게임이 끝난 뒤까지 빨갛게 둘 이유가 없다
  finalScore.textContent = `${score.toLocaleString('ko-KR')}점`;
  boardOverlay.hidden = false;
  setMessage('게임을 마쳤어요!', `최종 점수는 ${score.toLocaleString('ko-KR')}점이에요.`);
  playMatchSound(3);
  renderBoard();
  $('#restartButton').focus();
}

function showHint() {
  if (busy || gameOver) return;
  const move = findValidMoves(board)[0];
  if (!move) return;
  hintKeys = new Set(move.map(({ row, col }) => keyOf(row, col)));
  setMessage('반짝이는 두 블록을 바꿔보세요', '힌트는 이동 횟수를 사용하지 않아요.');
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

$('#hintButton').addEventListener('click', showHint);
$('#restartButton').addEventListener('click', startGame);
$('#newGameButton').addEventListener('click', () => $('#confirmDialog').showModal());
$('#cancelNewGameButton').addEventListener('click', () => $('#confirmDialog').close());
$('#confirmNewGameButton').addEventListener('click', () => { $('#confirmDialog').close(); startGame(); });

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
const settingsDialog = $('#settingsDialog');
const cropCanvas = $('#cropCanvas');
const cropContext = cropCanvas.getContext('2d');
let editorSlot = 0;
let editorFrame = FRAMES[0];
let editorImage = null;
let editorTransform = { x: 0, y: 0, scale: 1, baseScale: 1 };
let holeScale = .82;
let sampleSeed = 0;
let storageQueue = Promise.resolve();

function persistCustomImages() {
  const snapshot = [...customImages];
  storageQueue = storageQueue.catch(() => {}).then(() => saveCustomBlocks(snapshot));
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
    button.type = 'button'; button.className = 'slot-choice'; button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(index === editorSlot));
    button.setAttribute('aria-label', `${block.name} 블록${customImages[index] ? ', 사진 적용됨' : ', 기본 블록'}`);
    const image = new Image(); image.src = blockImage(index); image.alt = '';
    const label = document.createElement('span'); label.textContent = block.name;
    button.append(image, label);
    button.addEventListener('click', () => { editorSlot = index; renderSlots(); renderCrop(); });
    fragment.append(button);
  });
  list.replaceChildren(fragment);
}

function renderFrames() {
  const list = $('#frameList');
  const fragment = document.createDocumentFragment();
  FRAMES.forEach((frame) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'frame-choice'; button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(frame.id === editorFrame.id));
    const canvas = document.createElement('canvas'); drawFramePreview(canvas, frame);
    const label = document.createElement('span'); label.textContent = frame.name;
    button.append(canvas, label);
    button.addEventListener('click', () => { editorFrame = frame; renderFrames(); renderCrop(); });
    fragment.append(button);
  });
  list.replaceChildren(fragment);
}

function renderCrop() {
  renderCustomBlock(cropContext, cropCanvas.width, { frame: editorFrame, holeScale, image: editorImage, transform: editorTransform, cropGuide: true, slot: editorSlot });
}

function setEditorImage(image) {
  if (editorImage && editorImage !== image) editorImage.close?.();
  editorImage = image;
  editorTransform = initialTransform(image);
  $('#zoomRange').value = '100';
  $('#zoomOutput').textContent = '100%';
  $('#cropHint').textContent = '드래그로 이동 · 두 손가락으로 확대';
  $('#applyBlockButton').disabled = false;
  renderCrop();
}

async function usePhotoFile(file) {
  if (!file) return;
  try {
    setEditorImage(await decodePhoto(file));
    toast('사진을 불러왔어요');
  } catch {
    toast('사진을 읽지 못했어요');
  }
}

$('#openSettingsButton').addEventListener('click', () => { renderSlots(); renderFrames(); renderCrop(); settingsDialog.showModal(); });
$('#cameraButton').addEventListener('click', () => $('#cameraInput').click());
$('#galleryButton').addEventListener('click', () => $('#galleryInput').click());
$('#cameraInput').addEventListener('change', (event) => { usePhotoFile(event.target.files[0]); event.target.value = ''; });
$('#galleryInput').addEventListener('change', (event) => { usePhotoFile(event.target.files[0]); event.target.value = ''; });
$('#sampleButton').addEventListener('click', () => setEditorImage(samplePhoto(sampleSeed++)));
$('#resetCropButton').addEventListener('click', () => {
  if (!editorImage) return;
  editorTransform = initialTransform(editorImage);
  $('#zoomRange').value = '100';
  $('#zoomOutput').textContent = '100%';
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

$('#applyBlockButton').addEventListener('click', async () => {
  if (!editorImage) return;
  customImages[editorSlot] = customBlockDataUrl({ frame: editorFrame, holeScale, image: editorImage, transform: editorTransform, slot: editorSlot });
  renderSlots(); renderBoard();
  try {
    await persistCustomImages();
    toast(`${DEFAULT_BLOCKS[editorSlot].name} 블록을 꾸미고 저장했어요`);
  } catch { toast('블록은 적용했지만 저장하지 못했어요'); }
});
$('#restoreSlotButton').addEventListener('click', async () => {
  customImages[editorSlot] = null;
  renderSlots(); renderBoard();
  try {
    await persistCustomImages();
    toast('기본 블록으로 되돌리고 저장했어요');
  } catch { toast('블록은 되돌렸지만 저장하지 못했어요'); }
});

$('#exportPresetButton').addEventListener('click', () => {
  if (!customImages.some(Boolean)) { toast('먼저 사진 블록을 하나 이상 만들어주세요'); return; }
  const blob = new Blob([JSON.stringify({ app: 'sonjupang', version: BLOCK_FORMAT_VERSION, savedAt: new Date().toISOString(), blocks: customImages })], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `sonjupang-preset-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  toast('프리셋 파일을 저장했어요');
});
$('#importPresetButton').addEventListener('click', () => $('#presetInput').click());
$('#presetInput').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0];
    if (!file || file.size > 30_000_000) throw new Error('too large');
    const preset = safePresetData(JSON.parse(await file.text()));
    customImages = preset.blocks;
    if (preset.version < BLOCK_FORMAT_VERSION) await upgradeStoredBlocks();
    renderSlots(); renderBoard();
    await persistCustomImages();
    toast('프리셋을 불러오고 자동 저장했어요');
  } catch { toast('올바른 프리셋 파일이 아니에요'); }
  event.target.value = '';
});

$('#resetCustomBlocksButton').addEventListener('click', async () => {
  if (!customImages.some(Boolean)) { toast('초기화할 사진 블록이 없어요'); return; }
  if (!window.confirm('꾸민 블록을 모두 기본 블록으로 되돌릴까요? 저장된 사진 블록도 함께 삭제됩니다.')) return;
  try {
    await storageQueue.catch(() => {});
    await clearCustomBlocks();
    customImages = Array(DEFAULT_BLOCKS.length).fill(null);
    renderSlots(); renderBoard();
    toast('꾸민 블록을 모두 초기화했어요');
  } catch { toast('저장된 블록을 초기화하지 못했어요'); }
});

settingsDialog.addEventListener('close', () => $('#openSettingsButton').focus());

// 개발 서버에서는 등록하지 않는다. sw.js는 cache-first라 styles.css는 물론
// @vite/client와 의존성 모듈까지 캐시해, 코드를 고쳐도 화면이 바뀌지 않는다.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

async function initializeApp() {
  renderFrames();
  renderCrop();
  startGame();
  try {
    const stored = await loadCustomBlocks();
    customImages = stored.blocks;
    if (stored.version < BLOCK_FORMAT_VERSION && customImages.some(Boolean)) {
      await upgradeStoredBlocks();
      await persistCustomImages().catch(() => {});
    }
    const status = storageKind() === 'android'
      ? '꾸민 블록은 앱 내부에 자동 저장되며 앱 삭제 또는 전체 초기화 전까지 유지됩니다.'
      : '꾸민 블록은 이 브라우저에 자동 저장되며 사이트 데이터 삭제 또는 전체 초기화 전까지 유지됩니다.';
    $('#storageStatus').textContent = status;
  } catch {
    $('#storageStatus').textContent = '저장소를 열지 못했습니다. 프리셋 파일 저장 기능을 이용해주세요.';
  }
  renderSlots();
  renderBoard();
}

initializeApp();
