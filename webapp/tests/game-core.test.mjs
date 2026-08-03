import test from 'node:test';
import assert from 'node:assert/strict';
import {
  areAdjacent,
  collapseBoard,
  createsMatch,
  findMatches,
  findValidMoves,
  makeBoard,
  reshuffle,
  swapCells,
} from '../src/game-core.js';

test('가로·세로·교차 매치를 중복 없이 찾는다', () => {
  const board = [
    [1, 0, 2, 3, 4],
    [2, 0, 3, 4, 1],
    [0, 0, 0, 1, 2],
    [3, 2, 4, 2, 3],
    [4, 3, 1, 3, 4],
  ];
  assert.deepEqual([...findMatches(board)].sort(), ['0:1', '1:1', '2:0', '2:1', '2:2']);
});

test('인접 판정과 스왑이 원본 보드를 변경하지 않는다', () => {
  const board = [[0, 1], [2, 3]];
  assert.equal(areAdjacent({ row: 0, col: 0 }, { row: 0, col: 1 }), true);
  assert.equal(areAdjacent({ row: 0, col: 0 }, { row: 1, col: 1 }), false);
  const swapped = swapCells(board, { row: 0, col: 0 }, { row: 1, col: 0 });
  assert.deepEqual(swapped, [[2, 1], [0, 3]]);
  assert.deepEqual(board, [[0, 1], [2, 3]]);
});

test('매치를 만드는 교환과 가능한 수를 찾는다', () => {
  const board = [
    [0, 1, 0, 2, 3],
    [2, 0, 3, 4, 1],
    [1, 0, 2, 3, 4],
    [3, 2, 4, 1, 2],
    [4, 3, 1, 2, 0],
  ];
  assert.equal(createsMatch(board, { row: 0, col: 1 }, { row: 1, col: 1 }), true);
  assert.ok(findValidMoves(board).length > 0);
});

test('초기 보드는 즉시 매치가 없고 가능한 수가 있다', () => {
  for (let index = 0; index < 50; index += 1) {
    const board = makeBoard(Math.random);
    assert.equal(findMatches(board).size, 0);
    assert.ok(findValidMoves(board).length > 0);
  }
});

test('제거 뒤 블록이 아래로 모이고 빈칸이 채워진다', () => {
  const board = [
    [0, 1, 2, 3, 4],
    [0, 2, 3, 4, 1],
    [0, 3, 4, 1, 2],
    [2, 4, 1, 2, 3],
    [3, 1, 2, 3, 4],
  ];
  const result = collapseBoard(board, new Set(['0:0', '1:0', '2:0']), () => 0.99, 5);
  assert.deepEqual(result.board.map((row) => row[0]), [4, 4, 4, 2, 3]);
  assert.equal(result.spawned.size, 3);
});

test('셔플 후 즉시 매치 없이 플레이 가능하다', () => {
  const board = makeBoard(Math.random);
  const shuffled = reshuffle(board, Math.random);
  assert.equal(findMatches(shuffled).size, 0);
  assert.ok(findValidMoves(shuffled).length > 0);
  assert.deepEqual([...shuffled.flat()].sort(), [...board.flat()].sort());
});
