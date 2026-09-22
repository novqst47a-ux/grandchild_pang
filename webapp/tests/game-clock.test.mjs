import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameClock } from '../src/game-clock.js';
import {
  TREE_RULES,
  addTreeGrowth,
  createTreeState,
  finishTreeHarvest,
  getTreeTimeBonus,
  harvestTreeFruit,
} from '../src/tree-mode.js';

function fakeClock() {
  let milliseconds = 100_000;
  return {
    clock: createGameClock({ now: () => milliseconds }),
    now: () => milliseconds,
    advance(amount) { milliseconds += amount; },
  };
}

test('3분 시계는 실제 경과 시간을 빼고 남은 초를 올림해서 표시한다', () => {
  const { clock, advance } = fakeClock();
  assert.equal(clock.remaining(), 0);
  assert.equal(clock.isRunning(), false);
  clock.start(180);
  assert.equal(clock.remaining(), 180);
  assert.equal(clock.isRunning(), true);
  advance(125);
  assert.equal(clock.remaining(), 180);
  advance(875);
  assert.equal(clock.remaining(), 179);
  advance(178_500);
  assert.equal(clock.remaining(), 1);
  advance(500);
  assert.equal(clock.remaining(), 0);
  assert.equal(clock.isRunning(), false);
});

test('피버 중 시계를 멈추고 60초를 더한 뒤 남은 시간에서 재개한다', () => {
  const { clock, advance } = fakeClock();
  clock.start(180);
  advance(10_250);
  clock.pause();
  assert.equal(clock.remaining(), 170);
  assert.equal(clock.isRunning(), false);
  assert.equal(clock.addSeconds(60), true);
  assert.equal(clock.remaining(), 230);
  advance(3_600_000);
  assert.equal(clock.remaining(), 230);
  assert.equal(clock.isRunning(), false);
  clock.resume();
  assert.equal(clock.isRunning(), true);
  advance(229_749);
  assert.equal(clock.remaining(), 1);
  advance(1);
  assert.equal(clock.remaining(), 0);
});

test('반복 일시정지와 재개는 소수 초를 반올림하거나 시간을 늘리지 않는다', () => {
  const { clock, advance } = fakeClock();
  clock.start(2);
  for (let index = 0; index < 3; index += 1) {
    advance(125);
    clock.pause();
    advance(5_000);
    clock.pause();
    clock.resume();
    advance(125);
    clock.resume();
  }
  assert.equal(clock.remaining(), 2);
  advance(1_249);
  assert.equal(clock.remaining(), 1);
  advance(1);
  assert.equal(clock.remaining(), 0);
});

test('실행 중 시간 보너스는 기존 만료 시각에 더한다', () => {
  const { clock, advance } = fakeClock();
  clock.start(1);
  advance(750);
  assert.equal(clock.addSeconds(60), true);
  assert.equal(clock.remaining(), 61);
  advance(60_249);
  assert.equal(clock.remaining(), 1);
  advance(1);
  assert.equal(clock.remaining(), 0);
});

test('만료된 시계는 화면 갱신 전에도 추가 시간이나 재개로 되살릴 수 없다', () => {
  const { clock, advance } = fakeClock();
  clock.start(1);
  advance(1_001);
  assert.equal(clock.addSeconds(60), false);
  clock.pause();
  clock.resume();
  assert.equal(clock.remaining(), 0);
  assert.equal(clock.isRunning(), false);
  assert.equal(clock.addSeconds(60), false);
});

test('일시정지 중 게임을 끝내거나 새 게임을 시작하면 이전 시간이 남지 않는다', () => {
  const { clock, advance } = fakeClock();
  clock.start(180);
  advance(30_500);
  clock.pause();
  clock.addSeconds(60);
  clock.stop();
  clock.resume();
  assert.equal(clock.remaining(), 0);
  assert.equal(clock.addSeconds(60), false);

  clock.start(180);
  advance(50_500);
  clock.pause();
  clock.start(180);
  assert.equal(clock.isRunning(), true);
  assert.equal(clock.remaining(), 180);
  advance(179_999);
  assert.equal(clock.remaining(), 1);
  advance(1);
  assert.equal(clock.remaining(), 0);
});

test('시작 전 또는 잘못된 시간 값으로는 추가 시간을 줄 수 없다', () => {
  const { clock } = fakeClock();
  assert.equal(clock.addSeconds(60), false);
  clock.resume();
  assert.equal(clock.isRunning(), false);
  clock.start(180);
  for (const seconds of [0, -60, NaN, Infinity, '60', Number.MAX_VALUE]) {
    assert.equal(clock.addSeconds(seconds), false);
    assert.equal(clock.remaining(), 180);
  }
  clock.start(0);
  assert.equal(clock.remaining(), 0);
  assert.equal(clock.isRunning(), false);
});

test('두 번의 7초 피버 동안 기본 시간은 멈추고 반복 수확은 피버 만료 시 끝난다', () => {
  const { clock, advance, now } = fakeClock();
  const feverClock = createGameClock({ now });
  let state = createTreeState();
  let bonuses = 0;

  function updateTree(nextState) {
    const bonus = getTreeTimeBonus(state, nextState);
    if (bonus) {
      assert.equal(clock.addSeconds(bonus), true);
      clock.pause();
      bonuses += bonus;
    }
    if (state.phase === 'harvest' && nextState.phase === 'growing') clock.resume();
    state = nextState;
  }

  function collect(index) {
    if (!feverClock.isRunning()) return false;
    const result = harvestTreeFruit(state, index, now());
    updateTree(result.state);
    return result.awarded > 0;
  }

  clock.start(TREE_RULES.gameSeconds);
  advance(30_250);
  assert.equal(clock.remaining(), 120);
  for (const [cycle, frozenSeconds, expectedBonus] of [[1, 150, 30], [2, 160, 50]]) {
    updateTree(addTreeGrowth(state, Array(100).fill(0)));
    assert.equal(clock.remaining(), frozenSeconds);
    assert.equal(clock.isRunning(), false);
    assert.equal(bonuses, expectedBonus);

    // 남은 연쇄를 정리할 때는 기본 시계만 멈추고 아직 피버 시계는 시작하지 않는다.
    advance(700);
    assert.equal(clock.remaining(), frozenSeconds);
    feverClock.start(TREE_RULES.feverSeconds);
    for (let index = 0; index < 5; index += 1) {
      advance(1000);
      updateTree(state);
      assert.equal(clock.remaining(), frozenSeconds);
      assert.equal(bonuses, expectedBonus);
      assert.equal(collect(index % TREE_RULES.fruitCount), true);
      assert.equal(clock.remaining(), frozenSeconds);
      assert.equal(clock.isRunning(), false);
      assert.equal(state.phase, 'harvest');
    }
    assert.equal(state.harvestCount, 5);
    advance(1999);
    assert.equal(feverClock.remaining(), 1);
    assert.equal(collect(0), true);

    // 정확한 만료 경계뿐 아니라 백그라운드 탭의 긴 지연 뒤에도 수확을 막는다.
    advance(cycle === 1 ? 1 : 3_600_000);
    assert.equal(feverClock.remaining(), 0);
    const expiredState = state;
    assert.equal(collect(1), false);
    assert.strictEqual(state, expiredState);
    assert.equal(clock.remaining(), frozenSeconds);
    updateTree(finishTreeHarvest(state));
    assert.equal(clock.isRunning(), true);
    assert.equal(clock.remaining(), frozenSeconds);
    assert.equal(state.cycle, cycle + 1);
    if (cycle === 1) advance(10_000);
  }

  assert.equal(bonuses, 50);
  assert.equal(state.totalHarvested, 12);
  advance(159_749);
  assert.equal(clock.remaining(), 1);
  advance(1);
  assert.equal(clock.remaining(), 0);
  assert.equal(clock.addSeconds(30), false);
});
