// 설치 팝업의 판단 규칙. 팝업이 언제 스스로 뜨는지가 전부다 — 이미 설치한 사람이나
// 방금 "나중에"를 누른 사람에게 다시 뜨면, 게임보다 팝업이 먼저 기억에 남는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNOOZE_MS,
  isIosDevice,
  normalizeInstallState,
  readInstallState,
  shouldAutoShow,
} from '../src/install-prompt.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';

test('아이폰과 아이패드를 알아본다', () => {
  assert.equal(isIosDevice(IPHONE, 5), true);
  // iPadOS 13+는 데스크톱 사파리로 위장한다. 손가락 수로만 갈라낼 수 있다.
  assert.equal(isIosDevice(IPADOS, 5), true);
  assert.equal(isIosDevice(IPADOS, 0), false); // 진짜 맥은 홈 화면이 없다
  assert.equal(isIosDevice(ANDROID, 5), false);
  assert.equal(isIosDevice(), false);
});

test('저장된 값이 망가져 있어도 "한 번도 안 물어본 상태"로 이어진다', () => {
  for (const broken of [undefined, null, 'yes', 42, [], {}, { dismissedAt: -1 }, { installedAt: NaN }]) {
    assert.deepEqual(normalizeInstallState(broken), { dismissedAt: 0, installedAt: 0 });
  }
});

test('localStorage가 없거나 값이 깨져도 읽기가 터지지 않는다', () => {
  const throwing = { getItem() { throw new Error('private mode'); } };
  assert.deepEqual(readInstallState(null), { dismissedAt: 0, installedAt: 0 });
  assert.deepEqual(readInstallState(throwing), { dismissedAt: 0, installedAt: 0 });
  assert.deepEqual(readInstallState({ getItem: () => '{{{' }), { dismissedAt: 0, installedAt: 0 });
  assert.deepEqual(
    readInstallState({ getItem: () => '{"dismissedAt":10,"installedAt":0}' }),
    { dismissedAt: 10, installedAt: 0 },
  );
});

test('설치할 수 있는 브라우저에는 처음 한 번 스스로 뜬다', () => {
  const state = normalizeInstallState(null);
  assert.equal(shouldAutoShow({ mode: 'prompt', state, now: 1_000 }), true);
  assert.equal(shouldAutoShow({ mode: 'ios', state, now: 1_000 }), true);
});

test('설치 방법을 모르는 브라우저에는 스스로 뜨지 않는다', () => {
  const state = normalizeInstallState(null);
  // generic은 "브라우저 메뉴를 눌러 보세요" 안내일 뿐이라, 찾아온 사람에게만 보인다.
  assert.equal(shouldAutoShow({ mode: 'generic', state, now: 1_000 }), false);
  assert.equal(shouldAutoShow({ mode: '', state, now: 1_000 }), false);
});

test('이미 설치한 사람에게는 다시 묻지 않는다', () => {
  const state = normalizeInstallState({ installedAt: 500 });
  assert.equal(shouldAutoShow({ mode: 'prompt', state, now: 9_999_999_999 }), false);
});

test('"나중에"를 누르면 2주 동안 조용하다', () => {
  const state = normalizeInstallState({ dismissedAt: 1_000 });
  assert.equal(shouldAutoShow({ mode: 'prompt', state, now: 1_000 + SNOOZE_MS - 1 }), false);
  assert.equal(shouldAutoShow({ mode: 'prompt', state, now: 1_000 + SNOOZE_MS }), true);
});
