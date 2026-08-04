// 칭찬 효과 설정 규칙(기획 §2.2 / §3). 저장소에서 읽은 값이 망가져 있어도
// 게임이 멈추지 않고 기본값으로 이어지는지가 핵심이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRAISE_SETTINGS,
  FIREWORK_COUNT,
  mainParticleCount,
  normalizePraiseSettings,
} from '../src/praise-settings.js';

test('기본값은 파티클 켜짐 · 하트 사진 · 폭죽 켜짐이다', () => {
  assert.deepEqual({ ...DEFAULT_PRAISE_SETTINGS }, {
    praiseEffectEnabled: true,
    praiseParticleType: 'HEART_CROP',
    fireworksEnabled: true,
  });
});

test('저장된 값이 없거나 형식이 어긋나면 기본값으로 채운다', () => {
  for (const broken of [undefined, null, 'on', 42, [], {}, { praiseParticleType: 'STAR' }]) {
    assert.deepEqual(normalizePraiseSettings(broken), { ...DEFAULT_PRAISE_SETTINGS });
  }
});

test('저장된 값이 올바르면 그대로 쓴다', () => {
  assert.deepEqual(
    normalizePraiseSettings({ praiseEffectEnabled: false, praiseParticleType: 'BLOCK_SHAPE', fireworksEnabled: false }),
    { praiseEffectEnabled: false, praiseParticleType: 'BLOCK_SHAPE', fireworksEnabled: false },
  );
});

test('알 수 없는 항목은 흘리고 아는 항목만 남긴다', () => {
  const result = normalizePraiseSettings({ fireworksEnabled: false, speed: 'fast' });
  assert.deepEqual(Object.keys(result).sort(), ['fireworksEnabled', 'praiseEffectEnabled', 'praiseParticleType']);
  assert.equal(result.fireworksEnabled, false);
});

test('연속 매칭 수별 메인 파티클 개수는 2 / 3 / 6 이다 (기획 §2.2)', () => {
  assert.equal(mainParticleCount(1), 2);
  assert.equal(mainParticleCount(2), 3);
  assert.equal(mainParticleCount(3), 6);
  assert.equal(mainParticleCount(7), 6);
});

test('폭죽 파티클은 10개 이상이다 (기획 §2.3)', () => {
  assert.ok(FIREWORK_COUNT >= 10, `폭죽 개수가 모자라요: ${FIREWORK_COUNT}`);
});
