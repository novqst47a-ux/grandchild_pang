import { BLOCK_FORMAT_VERSION } from './custom-blocks.js';

const BLOCK_COUNT = 5;
const DB_NAME = 'sonjupang-local';
const DB_STORE = 'settings';
const WEB_KEY = 'custom-blocks';
const EFFECT_KEY = 'praise-effects';

function emptyBlocks() {
  return Array(BLOCK_COUNT).fill(null);
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length !== BLOCK_COUNT) return emptyBlocks();
  return blocks.map((value) => typeof value === 'string' && value.startsWith('data:image/') ? value : null);
}

function openWebDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function webTransaction(mode, operation) {
  const database = await openWebDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, mode);
    const request = operation(transaction.objectStore(DB_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

// 설치형 PWA에서는 이 호출이 자동 승인되어 저장 공간이 부족해도 IndexedDB가 지워지지 않는다.
// 브라우저 탭으로만 열어 둔 상태에서는 승인되지 않을 수 있고, 그때는 축출 대상이 된다.
// 사진을 오래 남기려면 홈 화면에 설치해야 한다는 뜻이다.
async function requestWebPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch { /* IndexedDB remains available even when persistence cannot be granted. */ }
}

export async function isStoragePersisted() {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  } catch { return false; }
}

// 합성 방식이 바뀌면(계획 D2) 저장된 이미지도 다시 얹어야 한다. 어느 방식으로 만든
// 이미지인지 구분하려고 형식 버전을 함께 둔다. 웹의 v1은 배열을 그대로 저장했으므로
// 배열이면 v1, 객체면 그 안의 version을 쓴다.
export async function loadCustomBlocks() {
  const stored = await webTransaction('readonly', (store) => store.get(WEB_KEY));
  if (Array.isArray(stored)) {
    return { version: 1, blocks: normalizeBlocks(stored), photos: emptyBlocks(), stickers: emptyBlocks() };
  }
  return {
    version: stored?.version ?? BLOCK_FORMAT_VERSION,
    blocks: normalizeBlocks(stored?.blocks),
    photos: normalizeBlocks(stored?.photos),
    stickers: normalizeBlocks(stored?.stickers),
  };
}

export async function saveCustomBlocks(blocks, photos, stickers) {
  const record = {
    version: BLOCK_FORMAT_VERSION,
    blocks: normalizeBlocks(blocks),
    photos: normalizeBlocks(photos),
    stickers: normalizeBlocks(stickers),
  };
  await webTransaction('readwrite', (store) => store.put(record, WEB_KEY));
  await requestWebPersistence();
}

export async function clearCustomBlocks() {
  await webTransaction('readwrite', (store) => store.delete(WEB_KEY));
}

// 칭찬 효과 설정. 사진과 달리 지워져도 잃을 것이 없으므로 기본값으로 돌아가면 그만이다.
// 형식 검사는 praise-settings.js의 normalizePraiseSettings가 맡는다.
export async function loadPraiseSettings() {
  return webTransaction('readonly', (store) => store.get(EFFECT_KEY));
}

export async function savePraiseSettings(settings) {
  await webTransaction('readwrite', (store) => store.put({ ...settings }, EFFECT_KEY));
}
