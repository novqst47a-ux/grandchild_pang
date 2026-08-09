export const GAME_MODES = Object.freeze({
  TIMED: 'timed',
  UNLIMITED: 'unlimited',
});

export const TIMED_GAME_SECONDS = 3 * 60;
export const UNLIMITED_CHECKPOINT = 9_999;
export const UNLIMITED_MAX_SCORE = 99_999;
export const RANKING_LIMIT = 3;

export function formatRemainingTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

export function formatGameScore(score, mode) {
  if (mode === GAME_MODES.UNLIMITED && score >= UNLIMITED_MAX_SCORE) return 'MAX';
  return Math.max(0, Math.floor(Number(score) || 0)).toLocaleString('ko-KR');
}

// 무제한 모드는 9,999점에서 반드시 한 번 멈춘다. 사용자가 계속하기를 고른 뒤에만
// 다음 구간으로 올라가며, MAX 뒤에도 판은 계속되지만 점수는 더 늘지 않는다.
export function addUnlimitedScore(currentScore, gainedScore, extended) {
  const current = Math.max(0, Math.floor(Number(currentScore) || 0));
  const gained = Math.max(0, Math.floor(Number(gainedScore) || 0));
  const limit = extended ? UNLIMITED_MAX_SCORE : UNLIMITED_CHECKPOINT;
  const score = Math.min(limit, current + gained);
  return {
    score,
    awarded: score - current,
    checkpointReached: !extended && current < UNLIMITED_CHECKPOINT && score === UNLIMITED_CHECKPOINT,
    maxReached: extended && current < UNLIMITED_MAX_SCORE && score === UNLIMITED_MAX_SCORE,
    atMax: score === UNLIMITED_MAX_SCORE,
  };
}

function normalizedRanking(entry) {
  const score = Math.floor(Number(entry?.score));
  const playedAt = typeof entry?.playedAt === 'string' ? entry.playedAt : '';
  if (!Number.isSafeInteger(score) || score < 0 || !playedAt || Number.isNaN(Date.parse(playedAt))) return null;
  return { score, playedAt };
}

export function normalizeTimedRankings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizedRanking)
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Date.parse(a.playedAt) - Date.parse(b.playedAt))
    .slice(0, RANKING_LIMIT);
}

export function addTimedRanking(rankings, score, playedAt = new Date().toISOString()) {
  const candidate = normalizedRanking({ score, playedAt });
  if (!candidate) return { rankings: normalizeTimedRankings(rankings), rank: null };

  const positioned = [
    ...normalizeTimedRankings(rankings).map((entry) => ({ entry, isNew: false })),
    { entry: candidate, isNew: true },
  ].sort((a, b) => b.entry.score - a.entry.score
    || Date.parse(a.entry.playedAt) - Date.parse(b.entry.playedAt)
    || Number(a.isNew) - Number(b.isNew));
  const position = positioned.findIndex(({ isNew }) => isNew);
  return {
    rankings: positioned.slice(0, RANKING_LIMIT).map(({ entry }) => entry),
    rank: position >= 0 && position < RANKING_LIMIT ? position + 1 : null,
  };
}
