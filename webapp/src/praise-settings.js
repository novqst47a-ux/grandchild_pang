// 칭찬 효과 설정값. 화면에도 저장소에도 매이지 않은 순수 값이라 테스트가 그대로 읽는다.
// 키 이름(praiseEffectEnabled 등)은 기획서 §3의 이름을 그대로 쓴다.
// 화면 문구는 어르신이 읽는 말로 따로 둔다(index.html).
export const PARTICLE_TYPES = ['HEART_CROP', 'BLOCK_SHAPE'];

export const DEFAULT_PRAISE_SETTINGS = Object.freeze({
  praiseEffectEnabled: true,
  praiseParticleType: 'HEART_CROP',
  fireworksEnabled: true,
});

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

export function normalizePraiseSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    praiseEffectEnabled: bool(source.praiseEffectEnabled, DEFAULT_PRAISE_SETTINGS.praiseEffectEnabled),
    praiseParticleType: PARTICLE_TYPES.includes(source.praiseParticleType)
      ? source.praiseParticleType
      : DEFAULT_PRAISE_SETTINGS.praiseParticleType,
    fireworksEnabled: bool(source.fireworksEnabled, DEFAULT_PRAISE_SETTINGS.fireworksEnabled),
  };
}

// 기획 §2.2 — 1연속 2개, 2연속 3개, 3연속 이상 6개.
export function mainParticleCount(combo) {
  if (combo >= 3) return 6;
  return combo >= 2 ? 3 : 2;
}

// 기획 §2.3 — 사각형 + 원형 폭죽은 10개 이상.
export const FIREWORK_COUNT = 12;
