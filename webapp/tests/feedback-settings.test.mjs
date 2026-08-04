// 소리·진동 켜기/끄기 저장 규칙. 저장소가 없거나 값이 망가져 있어도
// 게임이 멈추지 않고 "둘 다 켜짐"으로 이어지는지가 핵심이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FEEDBACK_SETTINGS,
  FEEDBACK_KEY,
  normalizeFeedbackSettings,
  readFeedbackSettings,
  writeFeedbackSettings,
} from '../src/feedback-settings.js';

// 브라우저 없이 돌리므로 localStorage 흉내를 낸다. throws를 켜면 사파리 비공개 모드가 된다.
function fakeStorage({ throws = false, seed = null } = {}) {
  const map = new Map(seed ? [[FEEDBACK_KEY, seed]] : []);
  return {
    getItem(key) { if (throws) throw new Error('저장소를 쓸 수 없어요'); return map.get(key) ?? null; },
    setItem(key, value) { if (throws) throw new Error('저장소를 쓸 수 없어요'); map.set(key, value); },
    raw: map,
  };
}

test('기본값은 소리 켜짐 · 진동 켜짐이다', () => {
  assert.deepEqual({ ...DEFAULT_FEEDBACK_SETTINGS }, { soundOn: true, vibrationOn: true });
});

test('저장된 값이 없거나 형식이 어긋나면 기본값으로 채운다', () => {
  for (const broken of [undefined, null, 'off', 0, [], {}, { soundOn: 'no' }]) {
    assert.deepEqual(normalizeFeedbackSettings(broken), { ...DEFAULT_FEEDBACK_SETTINGS });
  }
});

test('둘을 따로 끌 수 있다', () => {
  assert.deepEqual(normalizeFeedbackSettings({ soundOn: false, vibrationOn: true }), { soundOn: false, vibrationOn: true });
  assert.deepEqual(normalizeFeedbackSettings({ soundOn: true, vibrationOn: false }), { soundOn: true, vibrationOn: false });
});

test('알 수 없는 항목은 흘리고 아는 항목만 남긴다', () => {
  const result = normalizeFeedbackSettings({ vibrationOn: false, volume: 11 });
  assert.deepEqual(Object.keys(result).sort(), ['soundOn', 'vibrationOn']);
  assert.equal(result.vibrationOn, false);
});

test('껐다 켜도 유지된다 — 쓴 값을 그대로 다시 읽는다', () => {
  const storage = fakeStorage();
  writeFeedbackSettings(storage, { soundOn: false, vibrationOn: false });
  assert.deepEqual(readFeedbackSettings(storage), { soundOn: false, vibrationOn: false });

  writeFeedbackSettings(storage, { soundOn: true, vibrationOn: false });
  assert.deepEqual(readFeedbackSettings(storage), { soundOn: true, vibrationOn: false });
});

test('저장된 글자가 깨져 있어도 읽기가 터지지 않는다', () => {
  assert.deepEqual(readFeedbackSettings(fakeStorage({ seed: '{"soundOn":' })), { ...DEFAULT_FEEDBACK_SETTINGS });
});

test('저장소가 없거나 예외를 던져도 기본값으로 이어간다', () => {
  assert.deepEqual(readFeedbackSettings(null), { ...DEFAULT_FEEDBACK_SETTINGS });
  assert.deepEqual(readFeedbackSettings(fakeStorage({ throws: true })), { ...DEFAULT_FEEDBACK_SETTINGS });
  assert.doesNotThrow(() => writeFeedbackSettings(null, { soundOn: false, vibrationOn: false }));
  assert.doesNotThrow(() => writeFeedbackSettings(fakeStorage({ throws: true }), { soundOn: false, vibrationOn: false }));
});
