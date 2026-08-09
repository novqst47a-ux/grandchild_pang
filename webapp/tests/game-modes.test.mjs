import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_MODES,
  UNLIMITED_CHECKPOINT,
  UNLIMITED_MAX_SCORE,
  addTimedRanking,
  addUnlimitedScore,
  formatGameScore,
  formatRemainingTime,
  normalizeTimedRankings,
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

test('승인 후 99,999점에서 MAX가 되고 점수만 고정된다', () => {
  const result = addUnlimitedScore(99_990, 30, true);
  assert.equal(result.score, UNLIMITED_MAX_SCORE);
  assert.equal(result.awarded, 9);
  assert.equal(result.maxReached, true);
  assert.equal(result.atMax, true);
  assert.equal(addUnlimitedScore(result.score, 1_000, true).score, UNLIMITED_MAX_SCORE);
  assert.equal(formatGameScore(result.score, GAME_MODES.UNLIMITED), 'MAX');
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
