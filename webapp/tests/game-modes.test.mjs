import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_MODES,
  UNLIMITED_CHECKPOINT,
  UNLIMITED_MAX_SCORE,
  UNLIMITED_RESUME_STATES,
  addRanking,
  addTimedRanking,
  addUnlimitedScore,
  formatGameScore,
  formatRemainingTime,
  normalizeUnlimitedProgress,
  normalizeTimedRankings,
  normalizeRankings,
  unlimitedResumeState,
} from '../src/game-modes.js';

test('3분 타이머를 분:초 형식으로 표시한다', () => {
  assert.equal(formatRemainingTime(180), '3:00');
  assert.equal(formatRemainingTime(61), '1:01');
  assert.equal(formatRemainingTime(0), '0:00');
  assert.equal(formatRemainingTime(-10), '0:00');
});

test('무제한 점수는 9,999점에서 계속 여부를 확인하도록 멈춘다', () => {
  const result = addUnlimitedScore(9_980, 30, false);
  assert.deepEqual(result, {
    score: UNLIMITED_CHECKPOINT,
    awarded: 19,
    checkpointReached: true,
    maxReached: false,
    atMax: false,
  });
});

test('승인 후 99,999점에서 만점이 되고 점수만 고정된다', () => {
  const result = addUnlimitedScore(99_990, 30, true);
  assert.equal(result.score, UNLIMITED_MAX_SCORE);
  assert.equal(result.awarded, 9);
  assert.equal(result.maxReached, true);
  assert.equal(result.atMax, true);
  assert.equal(addUnlimitedScore(result.score, 1_000, true).score, UNLIMITED_MAX_SCORE);
  assert.equal(formatGameScore(result.score, GAME_MODES.UNLIMITED), '만점');
});

test('무제한 직전 점수는 이어하기 가능한 값으로 정규화한다', () => {
  assert.equal(normalizeUnlimitedProgress({ score: 1_230 }), 1_230);
  assert.equal(unlimitedResumeState({ score: 1_230 }), UNLIMITED_RESUME_STATES.AVAILABLE);
  assert.equal(normalizeUnlimitedProgress({ score: 0 }), null);
  assert.equal(normalizeUnlimitedProgress({ score: '깨진 값' }), null);
  assert.equal(unlimitedResumeState(null), UNLIMITED_RESUME_STATES.NONE);
});

test('무제한 만점 기록은 만점으로 고정하고 이어하기를 막는다', () => {
  assert.equal(normalizeUnlimitedProgress({ score: 120_000 }), UNLIMITED_MAX_SCORE);
  assert.equal(unlimitedResumeState({ score: UNLIMITED_MAX_SCORE }), UNLIMITED_RESUME_STATES.MAX);
});

test('시간 제한 기록은 점수순 상위 3개만 정규화한다', () => {
  const rankings = normalizeTimedRankings([
    { score: 300, playedAt: '2026-08-03T00:00:00.000Z' },
    { score: 900, playedAt: '2026-08-01T00:00:00.000Z' },
    { score: -1, playedAt: '2026-08-02T00:00:00.000Z' },
    { score: 600, playedAt: '2026-08-02T00:00:00.000Z' },
    { score: 100, playedAt: 'invalid' },
    { score: 400, playedAt: '2026-08-04T00:00:00.000Z' },
  ]);
  assert.deepEqual(rankings.map(({ score }) => score), [900, 600, 400]);
});

test('새 시간 제한 기록의 1~3위 진입 여부를 알려 준다', () => {
  const existing = [
    { score: 900, playedAt: '2026-08-01T00:00:00.000Z' },
    { score: 600, playedAt: '2026-08-02T00:00:00.000Z' },
    { score: 300, playedAt: '2026-08-03T00:00:00.000Z' },
  ];
  const placed = addTimedRanking(existing, 700, '2026-08-04T00:00:00.000Z');
  assert.equal(placed.rank, 2);
  assert.deepEqual(placed.rankings.map(({ score }) => score), [900, 700, 600]);

  const missed = addTimedRanking(existing, 100, '2026-08-04T00:00:00.000Z');
  assert.equal(missed.rank, null);
  assert.deepEqual(missed.rankings.map(({ score }) => score), [900, 600, 300]);
});

test('공통 랭킹은 점수와 날짜만 남기고 잘못된 데이터는 제외한다', () => {
  const playedAt = '2026-09-22T00:00:00.000Z';
  const invalidScores = [undefined, null, true, false, '', ' ', 'broken', NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1];
  const rankings = normalizeRankings([
    ...invalidScores.map((score) => ({ score, playedAt })),
    { score: 900, playedAt: 'invalid' },
    { score: 800 },
    null,
    { score: '2400.9', playedAt, totalHarvested: 99 },
    { score: 0, playedAt },
  ]);
  assert.deepEqual(rankings, [{ score: 2400, playedAt }, { score: 0, playedAt }]);
  for (const value of [undefined, null, {}, 'broken']) assert.deepEqual(normalizeRankings(value), []);
  assert.strictEqual(normalizeTimedRankings, normalizeRankings);
  assert.strictEqual(addTimedRanking, addRanking);
});

test('같은 점수는 먼저 세운 기록을 우선하고 같은 시각이면 기존 기록을 우선한다', () => {
  const earlier = '2026-09-20T00:00:00.000Z';
  const later = '2026-09-21T00:00:00.000Z';
  const existing = Object.freeze([
    Object.freeze({ score: 5000, playedAt: later }),
    Object.freeze({ score: 5000, playedAt: earlier }),
    Object.freeze({ score: 1000, playedAt: earlier }),
  ]);
  const inserted = addRanking(existing, 5000, later);
  assert.equal(inserted.rank, 3);
  assert.deepEqual(inserted.rankings, [
    { score: 5000, playedAt: earlier },
    { score: 5000, playedAt: later },
    { score: 5000, playedAt: later },
  ]);
  const missed = addRanking(inserted.rankings, 5000, later);
  assert.equal(missed.rank, null);
  assert.deepEqual(missed.rankings, inserted.rankings);
  assert.deepEqual(existing.map(({ score }) => score), [5000, 5000, 1000]);
  assert.deepEqual(addRanking(existing, null, later), { rankings: normalizeRankings(existing), rank: null });
});
