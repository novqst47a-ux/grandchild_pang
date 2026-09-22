export const TREE_RULES = Object.freeze({
  gameSeconds: 180,
  feverBonusSeconds: 30,
  feverSeconds: 7,
  fruitRespawnMilliseconds: 250,
  saplingPoints: 15,
  maturePoints: 35,
  pointsPerFruit: 5,
  fruitCount: 5,
  harvestBonus: 10,
});

const FULL_TREE_POINTS = TREE_RULES.maturePoints
  + TREE_RULES.pointsPerFruit * TREE_RULES.fruitCount;

export function createTreeState() {
  return {
    points: 0,
    phase: 'growing',
    fruitSlots: [],
    harvestCount: 0,
    fruitReadyAt: Array(TREE_RULES.fruitCount).fill(0),
    cycle: 1,
    totalHarvested: 0,
  };
}

export function getTreeStage(state) {
  if (state.points >= TREE_RULES.maturePoints) return 'mature';
  if (state.points >= TREE_RULES.saplingPoints) return 'sapling';
  return 'sprout';
}

export function getTreeTimeBonus(previousState, nextState) {
  return previousState?.phase === 'growing'
    && nextState?.phase === 'harvest'
    && Number.isSafeInteger(previousState.cycle)
    && previousState.cycle > 0
    && previousState.cycle === nextState.cycle
    ? TREE_RULES.feverBonusSeconds
    : 0;
}

function validSlots(slots) {
  return Array.isArray(slots)
    ? slots.filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < 5)
    : [];
}

export function addTreeGrowth(state, clearedSlots, customSlots = []) {
  if (state.phase !== 'growing') return state;
  const cleared = validSlots(clearedSlots);
  if (!cleared.length) return state;

  // 블록 한 개는 성장 1점이다. 점수나 연속 콤보 배율과는 독립적으로 센다.
  const points = Math.min(FULL_TREE_POINTS, state.points + cleared.length);
  const fruitCount = Math.max(0, Math.floor(
    (points - TREE_RULES.maturePoints) / TREE_RULES.pointsPerFruit,
  ));
  const custom = validSlots(customSlots);
  const fruitSources = custom.length ? custom : cleared;
  const fruitSlots = [...state.fruitSlots];
  while (fruitSlots.length < fruitCount) {
    const fruitIndex = fruitSlots.length;
    fruitSlots.push(fruitSources[fruitIndex % fruitSources.length] ?? fruitIndex % 5);
  }

  return {
    ...state,
    points,
    fruitSlots,
    phase: fruitCount === TREE_RULES.fruitCount ? 'harvest' : 'growing',
  };
}

export function harvestTreeFruit(state, index, now = Date.now()) {
  if (state.phase !== 'harvest'
    || !Number.isInteger(index)
    || index < 0
    || index >= state.fruitSlots.length
    || !Number.isFinite(now)
    || now < state.fruitReadyAt[index]) {
    return { state, awarded: 0 };
  }

  const fruitReadyAt = [...state.fruitReadyAt];
  fruitReadyAt[index] = now + TREE_RULES.fruitRespawnMilliseconds;
  return {
    state: {
      ...state,
      fruitReadyAt,
      harvestCount: state.harvestCount + 1,
      totalHarvested: state.totalHarvested + 1,
    },
    awarded: TREE_RULES.harvestBonus,
  };
}

export function finishTreeHarvest(state) {
  if (state.phase !== 'harvest') return state;
  return { ...createTreeState(), cycle: state.cycle + 1, totalHarvested: state.totalHarvested };
}

export function getTreeProgress(state, feverRemaining = TREE_RULES.feverSeconds) {
  if (state.phase === 'harvest') {
    return {
      value: Number.isFinite(feverRemaining) ? Math.max(0, Math.min(TREE_RULES.feverSeconds, feverRemaining)) : 0,
      max: TREE_RULES.feverSeconds,
      label: '수확 피버 남은 시간',
    };
  }
  const stage = getTreeStage(state);
  if (stage === 'sprout') {
    return { value: state.points, max: TREE_RULES.saplingPoints, label: '새싹 키우기' };
  }
  if (stage === 'sapling') {
    return {
      value: state.points - TREE_RULES.saplingPoints,
      max: TREE_RULES.maturePoints - TREE_RULES.saplingPoints,
      label: '어린 나무 키우기',
    };
  }
  return { value: state.fruitSlots.length, max: TREE_RULES.fruitCount, label: '열매 맺기' };
}
