import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';

// storage가 함께 읽는 블록 모듈은 초기화 시 프레임 파일의 기준 주소만 사용한다.
async function importStorage() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { baseURI: new URL('../index.html', import.meta.url).href },
  });
  try {
    return await import('../src/storage.js');
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
}
const { loadTimedRankings, loadTreeRankings, saveTimedRankings, saveTreeRankings, recordTimedScore, recordTreeScore } = await importStorage();

// 요청 성공과 트랜잭션 확정을 따로 실행해 저장 완료 시점과 취소 처리를 검사한다.
function installDatabase(t, initial = {}, { holdWrites = false } = {}) {
  const records = new Map(Object.entries(structuredClone(initial)));
  const opens = [];
  const transactions = [];
  const waiting = [];
  let active = false;
  let closed = 0;
  let notifyWrite;
  const writeRequested = new Promise((resolve) => { notifyWrite = resolve; });
  function startNextTransaction() {
    if (active || !waiting.length) return;
    active = true;
    queueMicrotask(waiting.shift());
  }
  const indexedDB = {
    open(name, version) {
      opens.push({ name, version });
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction(storeName, mode) {
            assert.equal(storeName, 'settings');
            const operations = [];
            const writes = new Map();
            const log = { mode, operations: [] };
            transactions.push(log);
            let completed = false;
            const transaction = {
              objectStore(name) {
                assert.equal(name, storeName);
                function operate(key, value, writing) {
                  if (writing) assert.equal(mode, 'readwrite');
                  const operation = {};
                  operations.push({ operation, key, value: structuredClone(value), writing });
                  log.operations.push({ action: writing ? 'put' : 'get', key });
                  return operation;
                }
                return {
                  get: (key) => operate(key, undefined, false),
                  put: (value, key) => operate(key, value, true),
                };
              },
              abort() { control.abort(new Error('transaction aborted')); },
            };
            function release() {
              completed = true;
              active = false;
              startNextTransaction();
            }
            const control = {
              commit() {
                if (completed) return;
                for (const [key, value] of writes) records.set(key, structuredClone(value));
                transaction.oncomplete?.();
                release();
              },
              abort(error) {
                if (completed) return;
                transaction.error = error;
                transaction.onabort?.();
                release();
              },
            };
            function processRequests() {
              if (completed) return;
              const next = operations.shift();
              if (next) {
                const { operation, key, value, writing } = next;
                if (writing) writes.set(key, value);
                operation.result = writing ? key : structuredClone(writes.has(key) ? writes.get(key) : records.get(key));
                operation.onsuccess?.();
                queueMicrotask(processRequests);
              } else if (mode === 'readwrite' && holdWrites) notifyWrite(control);
              else control.commit();
            }
            waiting.push(processRequests);
            startNextTransaction();
            return transaction;
          },
          close() { closed += 1; },
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else delete globalThis.indexedDB;
  });
  return { records, opens, transactions, writeRequested, get closed() { return closed; } };
}

const oldDate = '2026-09-20T00:00:00.000Z';
const newDate = '2026-09-22T00:00:00.000Z';

test('기존 3분 기록을 보존하면서 나무 기록은 별도 키에 저장한다', async (t) => {
  const timed = [{ score: 900, playedAt: oldDate }];
  const database = installDatabase(t, { 'timed-rankings': timed });
  assert.deepEqual(await loadTreeRankings(), []);
  assert.deepEqual(await loadTimedRankings(), timed);
  await saveTreeRankings([
    { score: 1400, playedAt: newDate },
    { score: 800, playedAt: oldDate },
    { score: 2600, playedAt: newDate, harvested: 9 },
    { score: 200, playedAt: newDate },
    { score: -1, playedAt: newDate },
  ]);
  const tree = [
    { score: 2600, playedAt: newDate },
    { score: 1400, playedAt: newDate },
    { score: 800, playedAt: oldDate },
  ];
  assert.deepEqual(await loadTreeRankings(), tree);
  assert.deepEqual(database.records.get('tree-rankings'), tree);
  assert.deepEqual(database.records.get('timed-rankings'), timed);
  const updatedTimed = [{ score: 1200, playedAt: newDate }];
  await saveTimedRankings(updatedTimed);
  assert.deepEqual(await loadTimedRankings(), updatedTimed);
  assert.deepEqual(await loadTreeRankings(), tree);
  assert.ok(database.opens.every(({ name, version }) => name === 'sonjupang-local' && version === 1));
  assert.equal(database.closed, database.opens.length);
});

test('손상된 나무 기록은 빈 목록으로 읽고 기존 시간 제한 기록에 영향을 주지 않는다', async (t) => {
  const timed = [{ score: 500, playedAt: oldDate }];
  const database = installDatabase(t, { 'timed-rankings': timed });
  for (const broken of [null, 'broken', {}, [{ score: null, playedAt: newDate }], [{ score: 100, playedAt: 'broken' }]]) {
    database.records.set('tree-rankings', broken);
    assert.deepEqual(await loadTreeRankings(), []);
  }
  assert.deepEqual(await loadTimedRankings(), timed);
});

test('나무 랭킹 저장은 요청 성공 뒤에도 트랜잭션이 확정될 때까지 기다린다', async (t) => {
  const database = installDatabase(t, {}, { holdWrites: true });
  const rankings = [{ score: 800, playedAt: newDate }];
  let resolved = false;
  const saving = saveTreeRankings(rankings).then(() => { resolved = true; });
  const write = await database.writeRequested;
  await setImmediate();
  assert.equal(resolved, false);
  assert.equal(database.records.has('tree-rankings'), false);
  write.commit();
  await saving;
  assert.equal(resolved, true);
  assert.deepEqual(database.records.get('tree-rankings'), rankings);
  assert.equal(database.closed, 1);
});

test('요청 성공 뒤 저장이 취소되면 실패를 반환하고 기존 랭킹을 보존한다', async (t) => {
  const existing = [{ score: 800, playedAt: oldDate }];
  const database = installDatabase(t, { 'tree-rankings': existing }, { holdWrites: true });
  const saving = saveTreeRankings([{ score: 2000, playedAt: newDate }]);
  const write = await database.writeRequested;
  const rejected = assert.rejects(saving, /quota exceeded/);
  write.abort(new Error('quota exceeded'));
  await rejected;
  assert.deepEqual(database.records.get('tree-rankings'), existing);
  assert.equal(database.closed, 1);
});

test('초기 목록을 읽지 못했어도 저장된 최고 기록에 새 점수를 원자적으로 추가한다', async (t) => {
  const tree = [{ score: 5000, playedAt: oldDate }];
  const timed = [{ score: 900, playedAt: oldDate }];
  const database = installDatabase(t, { 'tree-rankings': tree, 'timed-rankings': timed });
  const result = await recordTreeScore(200, newDate);
  assert.deepEqual(result, { rankings: [...tree, { score: 200, playedAt: newDate }], rank: 2 });
  assert.deepEqual(database.records.get('tree-rankings'), result.rankings);
  assert.deepEqual(database.records.get('timed-rankings'), timed);
  assert.deepEqual(database.transactions[0], {
    mode: 'readwrite',
    operations: [{ action: 'get', key: 'tree-rankings' }, { action: 'put', key: 'tree-rankings' }],
  });

  const timedResult = await recordTimedScore(1200, newDate);
  assert.equal(timedResult.rank, 1);
  assert.deepEqual(timedResult.rankings, [{ score: 1200, playedAt: newDate }, ...timed]);
  assert.deepEqual(database.records.get('tree-rankings'), result.rankings);
});

test('동시에 나무 점수를 추가해도 앞서 저장된 새 기록을 잃지 않는다', async (t) => {
  const database = installDatabase(t, { 'tree-rankings': [{ score: 500, playedAt: oldDate }] });
  const [first, second] = await Promise.all([
    recordTreeScore(800, oldDate),
    recordTreeScore(600, newDate),
  ]);
  assert.equal(first.rank, 1);
  assert.equal(second.rank, 2);
  assert.deepEqual(second.rankings, [
    { score: 800, playedAt: oldDate },
    { score: 600, playedAt: newDate },
    { score: 500, playedAt: oldDate },
  ]);
  assert.deepEqual(database.records.get('tree-rankings'), second.rankings);
  assert.equal(database.closed, 2);
});

test('원자적 랭킹 기록은 커밋까지 기다리고 취소되면 기존 기록을 보존한다', async (t) => {
  const existing = [{ score: 800, playedAt: oldDate }];
  const database = installDatabase(t, { 'tree-rankings': existing }, { holdWrites: true });
  let resolved = false;
  const saving = recordTreeScore(2000, newDate).then((value) => { resolved = true; return value; });
  const write = await database.writeRequested;
  await setImmediate();
  assert.equal(resolved, false);
  assert.deepEqual(database.records.get('tree-rankings'), existing);
  const rejected = assert.rejects(saving, /quota exceeded/);
  write.abort(new Error('quota exceeded'));
  await rejected;
  assert.deepEqual(database.records.get('tree-rankings'), existing);
  assert.equal(database.closed, 1);
});

test('잘못된 점수는 저장하지 않고 손상된 이전 랭킹은 새 기록으로 복구한다', async (t) => {
  const database = installDatabase(t, { 'tree-rankings': 'broken' });
  await assert.rejects(recordTreeScore(null, newDate), TypeError);
  await assert.rejects(recordTimedScore(100, 'broken'), TypeError);
  assert.equal(database.opens.length, 0);
  const result = await recordTreeScore(100);
  assert.equal(result.rank, 1);
  assert.equal(result.rankings[0].score, 100);
  assert.ok(Number.isFinite(Date.parse(result.rankings[0].playedAt)));
  assert.deepEqual(database.records.get('tree-rankings'), result.rankings);
});
