import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TREE_RULES,
  addTreeGrowth,
  createTreeState,
  finishTreeHarvest,
  getTreeGoals,
  getTreeProgress,
  getTreeStage,
  getTreeTimeBonus,
  harvestTreeFruit,
} from '../src/tree-mode.js';

function grow(points, customSlots = []) {
  return addTreeGrowth(createTreeState(), Array.from({ length: points }, (_, index) => index % 5), customSlots);
}

function freezeState(state) {
  Object.freeze(state.fruitSlots);
  Object.freeze(state.fruitReadyAt);
  return Object.freeze(state);
}

test('나무는 독립된 새싹 상태로 시작하고 성장 규칙은 고정한다', () => {
  assert.deepEqual(createTreeState(), {
    points: 0, phase: 'growing', fruitSlots: [], harvestCount: 0,
    fruitReadyAt: [0, 0, 0, 0, 0], cycle: 1, totalHarvested: 0,
  });
  assert.ok(Object.isFrozen(TREE_RULES));
  assert.equal(TREE_RULES.gameSeconds, 180);
  assert.equal(TREE_RULES.feverBonusSeconds, 30);
  assert.equal(TREE_RULES.feverSeconds, 7);
  assert.equal(TREE_RULES.fruitRespawnMilliseconds, 250);
  assert.equal(TREE_RULES.extraPointsPerTree, 1);
  const first = createTreeState();
  first.fruitSlots.push(3);
  first.fruitReadyAt[0] = 500;
  assert.deepEqual(createTreeState().fruitSlots, []);
  assert.deepEqual(createTreeState().fruitReadyAt, [0, 0, 0, 0, 0]);
});

test('첫 나무는 성장 16점과 37점에서 어린 나무와 다 자란 나무로 바뀐다', () => {
  for (const [points, stage] of [
    [0, 'sprout'], [15, 'sprout'], [16, 'sapling'], [36, 'sapling'], [37, 'mature'], [67, 'mature'],
  ]) {
    assert.equal(getTreeStage(grow(points)), stage, `${points}점`);
  }
});

test('블록 종류나 콤보 묶음과 관계없이 제거한 블록 한 개마다 1점씩 자란다', () => {
  const three = addTreeGrowth(createTreeState(), [4, 4, 4]);
  assert.equal(three.points, 3);
  const six = addTreeGrowth(three, [1, 1, 1]);
  assert.equal(six.points, 6);
  assert.equal(addTreeGrowth(createTreeState(), [4, 4, 4, 1, 1, 1]).points, six.points);
  assert.equal(addTreeGrowth(six, []).points, 6);
});

test('첫 나무는 다 자란 뒤 6점마다 열매가 하나씩 열리고 다섯 개에서 수확을 시작한다', () => {
  for (const [points, fruitCount] of [[37, 0], [42, 0], [43, 1], [49, 2], [55, 3], [61, 4], [66, 4], [67, 5]]) {
    const state = grow(points);
    assert.equal(state.fruitSlots.length, fruitCount, `${points}점`);
    assert.equal(state.phase, points === 67 ? 'harvest' : 'growing');
  }
});

test('큰 연쇄도 67점과 열매 다섯 개를 넘지 않고 수확 중 성장은 멈춘다', () => {
  const state = grow(300);
  assert.equal(state.points, 67);
  assert.equal(state.fruitSlots.length, 5);
  assert.equal(state.phase, 'harvest');
  assert.strictEqual(addTreeGrowth(state, [0, 1, 2]), state);
  const partial = harvestTreeFruit(state, 0).state;
  assert.strictEqual(addTreeGrowth(partial, [0, 1, 2]), partial);
});

test('열매는 설정된 커스텀 이미지 슬롯을 순서대로 반복해 사용한다', () => {
  let state = grow(43, [3, 1]);
  assert.deepEqual(state.fruitSlots, [3]);
  state = addTreeGrowth(state, Array(24).fill(0), [3, 1]);
  assert.deepEqual(state.fruitSlots, [3, 1, 3, 1, 3]);
  assert.deepEqual(grow(67, [4]).fruitSlots, [4, 4, 4, 4, 4]);
  assert.deepEqual(grow(67, [4, 3, 2, 1, 0]).fruitSlots, [4, 3, 2, 1, 0]);
});

test('커스텀 이미지가 없으면 제거한 블록의 슬롯을 열매에 사용한다', () => {
  const state = addTreeGrowth(grow(37), Array(30).fill(2));
  assert.deepEqual(state.fruitSlots, [2, 2, 2, 2, 2]);
  const invalidCustom = addTreeGrowth(grow(37), Array(30).fill(3), [-1, 5, 0.5, '1']);
  assert.deepEqual(invalidCustom.fruitSlots, [3, 3, 3, 3, 3]);
});

test('성장과 수확은 입력 상태와 슬롯 배열을 변경하지 않는다', () => {
  const state = freezeState(grow(42));
  const cleared = Object.freeze([3, 3, 3]);
  const custom = Object.freeze([1, 4]);
  const grown = addTreeGrowth(state, cleared, custom);
  assert.equal(state.points, 42);
  assert.deepEqual(state.fruitSlots, []);
  assert.equal(grown.points, 45);
  assert.deepEqual(grown.fruitSlots, [1]);

  const ready = freezeState(grow(67));
  const collected = harvestTreeFruit(ready, 2, 1000);
  assert.deepEqual(ready.fruitReadyAt, [0, 0, 0, 0, 0]);
  assert.equal(ready.harvestCount, 0);
  assert.equal(ready.totalHarvested, 0);
  assert.deepEqual(collected.state.fruitReadyAt, [0, 0, 1250, 0, 0]);
  assert.equal(collected.state.harvestCount, 1);
  assert.equal(collected.awarded, 10);
});

test('성장 중이거나 잘못된 인덱스와 시각에는 보너스를 주지 않는다', () => {
  const growing = grow(61);
  assert.deepEqual(harvestTreeFruit(growing, 0, 1000), { state: growing, awarded: 0 });
  const ready = grow(67);
  for (const index of [-1, 5, 0.5, '0', undefined, NaN]) {
    assert.deepEqual(harvestTreeFruit(ready, index, 1000), { state: ready, awarded: 0 });
  }
  for (const now of [NaN, Infinity, -Infinity, '1000', null]) {
    assert.deepEqual(harvestTreeFruit(ready, 0, now), { state: ready, awarded: 0 });
  }
});

test('같은 열매는 250ms 뒤에 다시 수확할 수 있고 다른 열매는 바로 수확할 수 있다', () => {
  const collected = harvestTreeFruit(grow(67), 4, 1000).state;
  for (const now of [1000, 1100, 1249]) {
    assert.deepEqual(harvestTreeFruit(collected, 4, now), { state: collected, awarded: 0 });
  }
  assert.equal(harvestTreeFruit(collected, 3, 1000).awarded, 10);
  const respawned = harvestTreeFruit(collected, 4, 1250);
  assert.equal(respawned.awarded, 10);
  assert.equal(respawned.state.harvestCount, 2);
  assert.equal(respawned.state.fruitReadyAt[4], 1500);
});

test('열매는 재생되어 다섯 개를 넘어도 피버를 유지하고 수확마다 10점을 준다', () => {
  let state = grow(100);
  let awarded = 0;
  for (let count = 0; count < 17; count += 1) {
    const result = harvestTreeFruit(state, count % 5, 1000 + count * 250);
    state = result.state;
    awarded += result.awarded;
    assert.equal(state.phase, 'harvest');
    assert.equal(state.cycle, 1);
    assert.equal(state.fruitSlots.length, 5);
  }
  assert.equal(awarded, 170);
  assert.equal(state.harvestCount, 17);
  assert.equal(state.totalHarvested, 17);
  assert.deepEqual(finishTreeHarvest(state), { ...createTreeState(), cycle: 2, totalHarvested: 17 });
});

test('피버 종료만 다음 새싹으로 바꾸며 수확이 없어도 종료되고 누적 수확은 보존한다', () => {
  const growing = grow(61);
  assert.strictEqual(finishTreeHarvest(growing), growing);
  let state = finishTreeHarvest(freezeState(grow(67)));
  assert.deepEqual(state, { ...createTreeState(), cycle: 2 });
  state = addTreeGrowth(state, Array(100).fill(0));
  state = harvestTreeFruit(state, 0, 1000).state;
  state = finishTreeHarvest(state);
  assert.deepEqual(state, { ...createTreeState(), cycle: 3, totalHarvested: 1 });
  assert.deepEqual(harvestTreeFruit(state, 0, 2000), { state, awarded: 0 });
  assert.strictEqual(finishTreeHarvest(state), state);
});

test('진행 게이지는 성장 단계와 피버의 남은 7초를 보여 준다', () => {
  assert.deepEqual(getTreeProgress(grow(15)), { value: 15, max: 16, label: '새싹 키우기' });
  assert.deepEqual(getTreeProgress(grow(16)), { value: 0, max: 21, label: '어린 나무 키우기' });
  assert.deepEqual(getTreeProgress(grow(36)), { value: 20, max: 21, label: '어린 나무 키우기' });
  assert.deepEqual(getTreeProgress(grow(37)), { value: 0, max: 5, label: '열매 맺기' });
  assert.deepEqual(getTreeProgress(grow(61)), { value: 4, max: 5, label: '열매 맺기' });
  const ready = grow(67);
  assert.deepEqual(getTreeProgress(ready), { value: 7, max: 7, label: '수확 피버 남은 시간' });
  assert.deepEqual(getTreeProgress(harvestTreeFruit(ready, 2, 1000).state, 4), { value: 4, max: 7, label: '수확 피버 남은 시간' });
  assert.equal(getTreeProgress(ready, 0).value, 0);
  assert.equal(getTreeProgress(ready, -1).value, 0);
  assert.equal(getTreeProgress(ready, 99).value, 7);
});

test('다섯 번째 열매로 피버에 진입하는 성장 처리에서만 30초를 더한다', () => {
  const initial = freezeState(createTreeState());
  const growing = freezeState(grow(66));
  assert.equal(getTreeTimeBonus(initial, growing), 0);
  assert.equal(getTreeTimeBonus(growing, growing), 0);

  const ready = freezeState(addTreeGrowth(growing, [3]));
  assert.equal(getTreeTimeBonus(growing, ready), 30);
  assert.equal(getTreeTimeBonus(ready, ready), 0);
  assert.equal(getTreeTimeBonus(ready, addTreeGrowth(ready, [0, 1, 2])), 0);
  assert.equal(getTreeTimeBonus(ready, harvestTreeFruit(ready, 2).state), 0);
  assert.equal(getTreeTimeBonus(initial, grow(300)), 30);
});

test('나무를 두 번 완성해도 각 주기마다 피버 시작 때 한 번씩만 시간을 준다', () => {
  let state = createTreeState();
  let bonusSeconds = 0;
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    const ready = addTreeGrowth(state, Array(100).fill(0));
    bonusSeconds += getTreeTimeBonus(state, ready);
    assert.equal(bonusSeconds, cycle * 30);
    state = ready;
    for (let index = 0; index < 5; index += 1) {
      const nextState = harvestTreeFruit(state, index).state;
      assert.equal(getTreeTimeBonus(state, nextState), 0);
      state = nextState;
    }
    const finished = finishTreeHarvest(state);
    assert.equal(getTreeTimeBonus(state, finished), 0);
    state = finished;
    assert.equal(state.cycle, cycle + 1);
    assert.equal(state.phase, 'growing');
  }
  assert.equal(bonusSeconds, 60);
});

test('다른 나무 주기를 연결하거나 잘못된 상태를 전달해도 추가 시간을 주지 않는다', () => {
  const growing = grow(66);
  const ready = grow(67);
  assert.equal(getTreeTimeBonus(growing, { ...ready, cycle: 2 }), 0);
  assert.equal(getTreeTimeBonus({ ...growing, cycle: 2 }, ready), 0);
  assert.equal(getTreeTimeBonus(ready, createTreeState()), 0);
  assert.equal(getTreeTimeBonus(undefined, ready), 0);
  assert.equal(getTreeTimeBonus(growing, null), 0);
  for (const cycle of [undefined, null, 0, -1, 1.5, '1']) {
    assert.equal(getTreeTimeBonus({ ...growing, cycle }, { ...ready, cycle }), 0);
  }
});

test('N번째 나무는 단계마다 N개씩 블록이 더 필요하다', () => {
  assert.deepEqual(getTreeGoals(1), { extra: 1, saplingPoints: 16, maturePoints: 37, pointsPerFruit: 6, fullPoints: 67 });
  assert.deepEqual(getTreeGoals(2), { extra: 2, saplingPoints: 17, maturePoints: 39, pointsPerFruit: 7, fullPoints: 74 });
  assert.deepEqual(getTreeGoals(5), { extra: 5, saplingPoints: 20, maturePoints: 45, pointsPerFruit: 10, fullPoints: 95 });
  for (const cycle of [undefined, null, 0, -1, 1.5, '2', NaN]) {
    assert.deepEqual(getTreeGoals(cycle), getTreeGoals(1), String(cycle));
  }
});

test('두 번째 나무부터는 어린 나무·큰 나무·열매까지 블록이 더 든다', () => {
  let state = finishTreeHarvest(grow(67));
  assert.equal(state.cycle, 2);
  state = addTreeGrowth(state, Array(16).fill(0));
  assert.equal(getTreeStage(state), 'sprout');
  assert.deepEqual(getTreeProgress(state), { value: 16, max: 17, label: '새싹 키우기' });
  state = addTreeGrowth(state, [0]);
  assert.equal(getTreeStage(state), 'sapling');
  assert.deepEqual(getTreeProgress(state), { value: 0, max: 22, label: '어린 나무 키우기' });
  state = addTreeGrowth(state, Array(21).fill(0));
  assert.equal(state.points, 38);
  assert.equal(getTreeStage(state), 'sapling');
  state = addTreeGrowth(state, [0]);
  assert.equal(state.points, 39);
  assert.equal(getTreeStage(state), 'mature');
  assert.deepEqual(state.fruitSlots, []);
  state = addTreeGrowth(state, Array(6).fill(1));
  assert.equal(state.points, 45);
  assert.deepEqual(state.fruitSlots, []);
  state = addTreeGrowth(state, [1]);
  assert.equal(state.points, 46);
  assert.deepEqual(state.fruitSlots, [1]);
  state = addTreeGrowth(state, Array(27).fill(2));
  assert.equal(state.points, 73);
  assert.equal(state.fruitSlots.length, 4);
  assert.equal(state.phase, 'growing');
  const ready = addTreeGrowth(state, [2]);
  assert.equal(ready.points, 74);
  assert.equal(ready.phase, 'harvest');
  assert.equal(getTreeTimeBonus(state, ready), 30);

  const fifth = { ...createTreeState(), cycle: 5 };
  assert.equal(getTreeStage(addTreeGrowth(fifth, Array(19).fill(0))), 'sprout');
  assert.equal(getTreeStage(addTreeGrowth(fifth, Array(20).fill(0))), 'sapling');
  assert.equal(getTreeStage(addTreeGrowth(fifth, Array(44).fill(0))), 'sapling');
  assert.equal(getTreeStage(addTreeGrowth(fifth, Array(45).fill(0))), 'mature');
  assert.equal(addTreeGrowth(fifth, Array(94).fill(0)).phase, 'growing');
  assert.equal(addTreeGrowth(fifth, Array(94).fill(0)).fruitSlots.length, 4);
  assert.equal(addTreeGrowth(fifth, Array(95).fill(0)).phase, 'harvest');
  assert.equal(addTreeGrowth(fifth, Array(300).fill(0)).points, 95);
});
