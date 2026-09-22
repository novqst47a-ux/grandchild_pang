import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TREE_RULES,
  addTreeGrowth,
  createTreeState,
  finishTreeHarvest,
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
  assert.equal(TREE_RULES.feverBonusSeconds, 60);
  assert.equal(TREE_RULES.feverSeconds, 15);
  assert.equal(TREE_RULES.fruitRespawnMilliseconds, 250);
  const first = createTreeState();
  first.fruitSlots.push(3);
  first.fruitReadyAt[0] = 500;
  assert.deepEqual(createTreeState().fruitSlots, []);
  assert.deepEqual(createTreeState().fruitReadyAt, [0, 0, 0, 0, 0]);
});

test('성장 15점과 35점에서 어린 나무와 다 자란 나무로 바뀐다', () => {
  for (const [points, stage] of [
    [0, 'sprout'], [14, 'sprout'], [15, 'sapling'], [34, 'sapling'], [35, 'mature'], [60, 'mature'],
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

test('다 자란 뒤 5점마다 열매가 하나씩 열리고 다섯 개에서 수확을 시작한다', () => {
  for (const [points, fruitCount] of [[35, 0], [39, 0], [40, 1], [45, 2], [50, 3], [55, 4], [59, 4], [60, 5]]) {
    const state = grow(points);
    assert.equal(state.fruitSlots.length, fruitCount, `${points}점`);
    assert.equal(state.phase, points === 60 ? 'harvest' : 'growing');
  }
});

test('큰 연쇄도 60점과 열매 다섯 개를 넘지 않고 수확 중 성장은 멈춘다', () => {
  const state = grow(300);
  assert.equal(state.points, 60);
  assert.equal(state.fruitSlots.length, 5);
  assert.equal(state.phase, 'harvest');
  assert.strictEqual(addTreeGrowth(state, [0, 1, 2]), state);
  const partial = harvestTreeFruit(state, 0).state;
  assert.strictEqual(addTreeGrowth(partial, [0, 1, 2]), partial);
});

test('열매는 설정된 커스텀 이미지 슬롯을 순서대로 반복해 사용한다', () => {
  let state = grow(40, [3, 1]);
  assert.deepEqual(state.fruitSlots, [3]);
  state = addTreeGrowth(state, Array(20).fill(0), [3, 1]);
  assert.deepEqual(state.fruitSlots, [3, 1, 3, 1, 3]);
  assert.deepEqual(grow(60, [4]).fruitSlots, [4, 4, 4, 4, 4]);
  assert.deepEqual(grow(60, [4, 3, 2, 1, 0]).fruitSlots, [4, 3, 2, 1, 0]);
});

test('커스텀 이미지가 없으면 제거한 블록의 슬롯을 열매에 사용한다', () => {
  const state = addTreeGrowth(grow(35), Array(25).fill(2));
  assert.deepEqual(state.fruitSlots, [2, 2, 2, 2, 2]);
  const invalidCustom = addTreeGrowth(grow(35), Array(25).fill(3), [-1, 5, 0.5, '1']);
  assert.deepEqual(invalidCustom.fruitSlots, [3, 3, 3, 3, 3]);
});

test('성장과 수확은 입력 상태와 슬롯 배열을 변경하지 않는다', () => {
  const state = freezeState(grow(39));
  const cleared = Object.freeze([3, 3, 3]);
  const custom = Object.freeze([1, 4]);
  const grown = addTreeGrowth(state, cleared, custom);
  assert.equal(state.points, 39);
  assert.deepEqual(state.fruitSlots, []);
  assert.equal(grown.points, 42);
  assert.deepEqual(grown.fruitSlots, [1]);

  const ready = freezeState(grow(60));
  const collected = harvestTreeFruit(ready, 2, 1000);
  assert.deepEqual(ready.fruitReadyAt, [0, 0, 0, 0, 0]);
  assert.equal(ready.harvestCount, 0);
  assert.equal(ready.totalHarvested, 0);
  assert.deepEqual(collected.state.fruitReadyAt, [0, 0, 1250, 0, 0]);
  assert.equal(collected.state.harvestCount, 1);
  assert.equal(collected.awarded, 200);
});

test('성장 중이거나 잘못된 인덱스와 시각에는 보너스를 주지 않는다', () => {
  const growing = grow(55);
  assert.deepEqual(harvestTreeFruit(growing, 0, 1000), { state: growing, awarded: 0 });
  const ready = grow(60);
  for (const index of [-1, 5, 0.5, '0', undefined, NaN]) {
    assert.deepEqual(harvestTreeFruit(ready, index, 1000), { state: ready, awarded: 0 });
  }
  for (const now of [NaN, Infinity, -Infinity, '1000', null]) {
    assert.deepEqual(harvestTreeFruit(ready, 0, now), { state: ready, awarded: 0 });
  }
});

test('같은 열매는 250ms 뒤에 다시 수확할 수 있고 다른 열매는 바로 수확할 수 있다', () => {
  const collected = harvestTreeFruit(grow(60), 4, 1000).state;
  for (const now of [1000, 1100, 1249]) {
    assert.deepEqual(harvestTreeFruit(collected, 4, now), { state: collected, awarded: 0 });
  }
  assert.equal(harvestTreeFruit(collected, 3, 1000).awarded, 200);
  const respawned = harvestTreeFruit(collected, 4, 1250);
  assert.equal(respawned.awarded, 200);
  assert.equal(respawned.state.harvestCount, 2);
  assert.equal(respawned.state.fruitReadyAt[4], 1500);
});

test('열매는 재생되어 다섯 개를 넘어도 피버를 유지하고 수확마다 200점을 준다', () => {
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
  assert.equal(awarded, 3_400);
  assert.equal(state.harvestCount, 17);
  assert.equal(state.totalHarvested, 17);
  assert.deepEqual(finishTreeHarvest(state), { ...createTreeState(), cycle: 2, totalHarvested: 17 });
});

test('피버 종료만 다음 새싹으로 바꾸며 수확이 없어도 종료되고 누적 수확은 보존한다', () => {
  const growing = grow(55);
  assert.strictEqual(finishTreeHarvest(growing), growing);
  let state = finishTreeHarvest(freezeState(grow(60)));
  assert.deepEqual(state, { ...createTreeState(), cycle: 2 });
  state = addTreeGrowth(state, Array(60).fill(0));
  state = harvestTreeFruit(state, 0, 1000).state;
  state = finishTreeHarvest(state);
  assert.deepEqual(state, { ...createTreeState(), cycle: 3, totalHarvested: 1 });
  assert.deepEqual(harvestTreeFruit(state, 0, 2000), { state, awarded: 0 });
  assert.strictEqual(finishTreeHarvest(state), state);
});

test('진행 게이지는 성장 단계와 피버의 남은 15초를 보여 준다', () => {
  assert.deepEqual(getTreeProgress(grow(14)), { value: 14, max: 15, label: '새싹 키우기' });
  assert.deepEqual(getTreeProgress(grow(15)), { value: 0, max: 20, label: '어린 나무 키우기' });
  assert.deepEqual(getTreeProgress(grow(34)), { value: 19, max: 20, label: '어린 나무 키우기' });
  assert.deepEqual(getTreeProgress(grow(35)), { value: 0, max: 5, label: '열매 맺기' });
  assert.deepEqual(getTreeProgress(grow(55)), { value: 4, max: 5, label: '열매 맺기' });
  const ready = grow(60);
  assert.deepEqual(getTreeProgress(ready), { value: 15, max: 15, label: '수확 피버 남은 시간' });
  assert.deepEqual(getTreeProgress(harvestTreeFruit(ready, 2, 1000).state, 9), { value: 9, max: 15, label: '수확 피버 남은 시간' });
  assert.equal(getTreeProgress(ready, 0).value, 0);
  assert.equal(getTreeProgress(ready, -1).value, 0);
  assert.equal(getTreeProgress(ready, 99).value, 15);
});

test('다섯 번째 열매로 피버에 진입하는 성장 처리에서만 60초를 더한다', () => {
  const initial = freezeState(createTreeState());
  const growing = freezeState(grow(59));
  assert.equal(getTreeTimeBonus(initial, growing), 0);
  assert.equal(getTreeTimeBonus(growing, growing), 0);

  const ready = freezeState(addTreeGrowth(growing, [3]));
  assert.equal(getTreeTimeBonus(growing, ready), 60);
  assert.equal(getTreeTimeBonus(ready, ready), 0);
  assert.equal(getTreeTimeBonus(ready, addTreeGrowth(ready, [0, 1, 2])), 0);
  assert.equal(getTreeTimeBonus(ready, harvestTreeFruit(ready, 2).state), 0);
  assert.equal(getTreeTimeBonus(initial, grow(300)), 60);
});

test('나무를 두 번 완성해도 각 주기마다 피버 시작 때 한 번씩만 시간을 준다', () => {
  let state = createTreeState();
  let bonusSeconds = 0;
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    const ready = addTreeGrowth(state, Array(60).fill(0));
    bonusSeconds += getTreeTimeBonus(state, ready);
    assert.equal(bonusSeconds, cycle * 60);
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
  assert.equal(bonusSeconds, 120);
});

test('다른 나무 주기를 연결하거나 잘못된 상태를 전달해도 추가 시간을 주지 않는다', () => {
  const growing = grow(59);
  const ready = grow(60);
  assert.equal(getTreeTimeBonus(growing, { ...ready, cycle: 2 }), 0);
  assert.equal(getTreeTimeBonus({ ...growing, cycle: 2 }, ready), 0);
  assert.equal(getTreeTimeBonus(ready, createTreeState()), 0);
  assert.equal(getTreeTimeBonus(undefined, ready), 0);
  assert.equal(getTreeTimeBonus(growing, null), 0);
  for (const cycle of [undefined, null, 0, -1, 1.5, '1']) {
    assert.equal(getTreeTimeBonus({ ...growing, cycle }, { ...ready, cycle }), 0);
  }
});
