import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

const BLOCK_COUNT = 5;
const META_KEY = 'custom-blocks-v1';
const DB_NAME = 'sonjupang-local';
const DB_STORE = 'settings';
const WEB_KEY = 'custom-blocks';
const NATIVE_DIRECTORY = 'custom-blocks';

function emptyBlocks() {
  return Array(BLOCK_COUNT).fill(null);
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length !== BLOCK_COUNT) return emptyBlocks();
  return blocks.map((value) => typeof value === 'string' && value.startsWith('data:image/') ? value : null);
}

function splitDataUrl(dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error('지원하지 않는 이미지 데이터입니다.');
  return { mime: match[1], data: match[2] };
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

async function requestWebPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch { /* IndexedDB remains available even when persistence cannot be granted. */ }
}

async function loadNativeBlocks() {
  const { value } = await Preferences.get({ key: META_KEY });
  if (!value) return emptyBlocks();
  const metadata = JSON.parse(value);
  if (metadata.version !== 1 || !Array.isArray(metadata.blocks)) return emptyBlocks();
  return Promise.all(Array.from({ length: BLOCK_COUNT }, async (_, index) => {
    const entry = metadata.blocks[index];
    if (!entry?.file || !entry?.mime) return null;
    try {
      const result = await Filesystem.readFile({ path: `${NATIVE_DIRECTORY}/${entry.file}`, directory: Directory.Data });
      return typeof result.data === 'string' ? `data:${entry.mime};base64,${result.data}` : null;
    } catch { return null; }
  }));
}

async function saveNativeBlocks(blocks) {
  try { await Filesystem.mkdir({ path: NATIVE_DIRECTORY, directory: Directory.Data, recursive: true }); } catch { /* already exists */ }
  const metadata = { version: 1, blocks: [] };
  for (let index = 0; index < BLOCK_COUNT; index += 1) {
    const value = blocks[index];
    const file = `block-${index}.img`;
    if (!value) {
      metadata.blocks.push(null);
      try { await Filesystem.deleteFile({ path: `${NATIVE_DIRECTORY}/${file}`, directory: Directory.Data }); } catch { /* absent */ }
      continue;
    }
    const { mime, data } = splitDataUrl(value);
    await Filesystem.writeFile({ path: `${NATIVE_DIRECTORY}/${file}`, data, directory: Directory.Data });
    metadata.blocks.push({ file, mime });
  }
  await Preferences.set({ key: META_KEY, value: JSON.stringify(metadata) });
}

export function storageKind() {
  return Capacitor.isNativePlatform() ? 'android' : 'web';
}

export async function loadCustomBlocks() {
  if (Capacitor.isNativePlatform()) return normalizeBlocks(await loadNativeBlocks());
  const stored = await webTransaction('readonly', (store) => store.get(WEB_KEY));
  return normalizeBlocks(stored);
}

export async function saveCustomBlocks(blocks) {
  const normalized = normalizeBlocks(blocks);
  if (Capacitor.isNativePlatform()) return saveNativeBlocks(normalized);
  await webTransaction('readwrite', (store) => store.put(normalized, WEB_KEY));
  await requestWebPersistence();
}

export async function clearCustomBlocks() {
  if (Capacitor.isNativePlatform()) {
    try { await Filesystem.rmdir({ path: NATIVE_DIRECTORY, directory: Directory.Data, recursive: true }); } catch { /* absent */ }
    await Preferences.remove({ key: META_KEY });
    return;
  }
  await webTransaction('readwrite', (store) => store.delete(WEB_KEY));
}
