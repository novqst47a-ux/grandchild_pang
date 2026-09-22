import { BLOCK_FORMAT_VERSION } from './custom-blocks.js';
import { addRanking, normalizeRankings, normalizeUnlimitedProgress } from './game-modes.js';

const BLOCK_COUNT = 5;
const DB_NAME = 'sonjupang-local';
const DB_STORE = 'settings';
const WEB_KEY = 'custom-blocks';
const EFFECT_KEY = 'praise-effects';
const TIMED_RANKINGS_KEY = 'timed-rankings';
const TREE_RANKINGS_KEY = 'tree-rankings';
const UNLIMITED_PROGRESS_KEY = 'unlimited-progress';

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
    try {
      const transaction = database.transaction(DB_STORE, mode);
      let result;
      // 요청 성공 뒤에도 저장 용량 등의 문제로 트랜잭션이 취소될 수 있다.
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error('저장 트랜잭션 오류')); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error('저장 트랜잭션 취소')); };
      const request = operation(transaction.objectStore(DB_STORE));
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
    } catch (error) {
      database.close();
      reject(error);
    }
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

// 사진 블록과 같은 IndexedDB 안에 두되 키는 분리한다. 무제한 모드는 이 함수를
// 호출하지 않으므로 기록이 남지 않는다.
export async function loadTimedRankings() {
  return normalizeRankings(await webTransaction('readonly', (store) => store.get(TIMED_RANKINGS_KEY)));
}

export async function saveTimedRankings(rankings) {
  const normalized = normalizeRankings(rankings);
  await webTransaction('readwrite', (store) => store.put(normalized, TIMED_RANKINGS_KEY));
}

export async function loadTreeRankings() {
  return normalizeRankings(await webTransaction('readonly', (store) => store.get(TREE_RANKINGS_KEY)));
}

export async function saveTreeRankings(rankings) {
  const normalized = normalizeRankings(rankings);
  await webTransaction('readwrite', (store) => store.put(normalized, TREE_RANKINGS_KEY));
}

async function recordScore(key, score, playedAt = new Date().toISOString()) {
  const candidate = normalizeRankings([{ score, playedAt }])[0];
  if (!candidate) throw new TypeError('점수와 기록 날짜를 확인해 주세요');
  const database = await openWebDatabase();
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction(DB_STORE, 'readwrite');
      const store = transaction.objectStore(DB_STORE);
      let result;
      transaction.oncomplete = () => { database.close(); resolve(result); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error('랭킹 저장 오류')); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error('랭킹 저장 취소')); };
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        try {
          result = addRanking(request.result, candidate.score, candidate.playedAt);
          const write = store.put(result.rankings, key);
          write.onerror = () => reject(write.error);
        } catch (error) {
          reject(error);
          transaction.abort();
        }
      };
    } catch (error) {
      database.close();
      reject(error);
      transaction?.abort();
    }
  });
}

// 읽기와 쓰기를 한 트랜잭션에 묶어 느린 초기 로드나 다른 탭의 기록을 덮어쓰지 않는다.
export function recordTimedScore(score, playedAt) {
  return recordScore(TIMED_RANKINGS_KEY, score, playedAt);
}

export function recordTreeScore(score, playedAt) {
  return recordScore(TREE_RANKINGS_KEY, score, playedAt);
}

export async function loadUnlimitedProgress() {
  return normalizeUnlimitedProgress(await webTransaction('readonly', (store) => store.get(UNLIMITED_PROGRESS_KEY)));
}

export async function saveUnlimitedProgress(score) {
  const normalized = normalizeUnlimitedProgress({ score });
  if (normalized === null) {
    await clearUnlimitedProgress();
    return;
  }
  await webTransaction('readwrite', (store) => store.put({ score: normalized }, UNLIMITED_PROGRESS_KEY));
}

export async function clearUnlimitedProgress() {
  await webTransaction('readwrite', (store) => store.delete(UNLIMITED_PROGRESS_KEY));
}
