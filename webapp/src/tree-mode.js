export const TREE_RULES = Object.freeze({
  gameSeconds: 180,
  feverBonusSeconds: 30,
  feverSeconds: 7,
  fruitRespawnMilliseconds: 250,
  // 단계별 기본 블록 수. 어린 나무까지 15, 큰 나무까지 20(=35-15), 열매 하나에 5.
  // N번째 나무는 단계마다 extraPointsPerTree × N개가 더 든다(getTreeGoals).
  saplingPoints: 15,
  maturePoints: 35,
  pointsPerFruit: 5,
  extraPointsPerTree: 1,
  fruitCount: 5,
  harvestBonus: 10,
});

// 나무를 완성할 때마다 다음 나무는 단계마다 나무 번호만큼 블록이 더 필요하다.
// 1번째 나무: 16 → 37, 열매당 6 (총 67). 5번째 나무: 20 → 45, 열매당 10 (총 95).
export function getTreeGoals(cycle = 1) {
  const tree = Number.isSafeInteger(cycle) && cycle > 0 ? cycle : 1;
  const extra = TREE_RULES.extraPointsPerTree * tree;
  const saplingPoints = TREE_RULES.saplingPoints + extra;
  const maturePoints = saplingPoints + (TREE_RULES.maturePoints - TREE_RULES.saplingPoints) + extra;
  const pointsPerFruit = TREE_RULES.pointsPerFruit + extra;
  return {
    extra,
    saplingPoints,
    maturePoints,
    pointsPerFruit,
    fullPoints: maturePoints + pointsPerFruit * TREE_RULES.fruitCount,
  };
}

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
  const goals = getTreeGoals(state.cycle);
  if (state.points >= goals.maturePoints) return 'mature';
  if (state.points >= goals.saplingPoints) return 'sapling';
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
  const goals = getTreeGoals(state.cycle);
  const points = Math.min(goals.fullPoints, state.points + cleared.length);
  const fruitCount = Math.max(0, Math.floor(
    (points - goals.maturePoints) / goals.pointsPerFruit,
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
  const goals = getTreeGoals(state.cycle);
  const stage = getTreeStage(state);
  if (stage === 'sprout') {
    return { value: state.points, max: goals.saplingPoints, label: '새싹 키우기' };
  }
  if (stage === 'sapling') {
    return {
      value: state.points - goals.saplingPoints,
      max: goals.maturePoints - goals.saplingPoints,
      label: '어린 나무 키우기',
    };
  }
  return { value: state.fruitSlots.length, max: TREE_RULES.fruitCount, label: '열매 맺기' };
}
