// 소리·진동 켜기/끄기. 어르신이 한 번 끈 것을 다음에 열 때 또 끄게 만들지 않는다.
//
// 칭찬 효과(praise-settings)는 IndexedDB에 두지만 이 둘은 localStorage에 둔다. 읽기가
// 동기라서 첫 그리기 전에 값을 알 수 있고, 그래야 켜자마자 🔊가 잠깐 보였다가 🔇로
// 바뀌는 깜빡임이 없다. 사진과 달리 지워져도 잃을 것이 없는 값이기도 하다.
export const FEEDBACK_KEY = 'sonjupang-feedback';

export const DEFAULT_FEEDBACK_SETTINGS = Object.freeze({
  soundOn: true,
  vibrationOn: true,
});

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

export function normalizeFeedbackSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    soundOn: bool(source.soundOn, DEFAULT_FEEDBACK_SETTINGS.soundOn),
    vibrationOn: bool(source.vibrationOn, DEFAULT_FEEDBACK_SETTINGS.vibrationOn),
  };
}

export function defaultFeedbackStorage() {
  // 사파리 비공개 모드에서는 localStorage에 손대는 것만으로 예외가 난다.
  try { return window.localStorage; } catch { return null; }
}

export function readFeedbackSettings(storage) {
  try { return normalizeFeedbackSettings(JSON.parse(storage?.getItem(FEEDBACK_KEY) ?? 'null')); }
  catch { return { ...DEFAULT_FEEDBACK_SETTINGS }; }
}

export function writeFeedbackSettings(storage, settings) {
  try { storage?.setItem(FEEDBACK_KEY, JSON.stringify(normalizeFeedbackSettings(settings))); }
  catch { /* 기억하지 못해도 이번 판의 소리·진동은 그대로 동작한다 */ }
}
