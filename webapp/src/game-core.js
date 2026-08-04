export const BOARD_SIZE = 5;
export const TYPE_COUNT = 5;
export const START_MOVES = 20;
export const POINTS_PER_BLOCK = 10;

export function keyOf(row, col) {
  return `${row}:${col}`;
}

export function areAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

export function swapCells(board, a, b) {
  const copy = board.map((row) => [...row]);
  [copy[a.row][a.col], copy[b.row][b.col]] = [copy[b.row][b.col], copy[a.row][a.col]];
  return copy;
}

export function findMatches(board) {
  const matched = new Set();
  const size = board.length;

  for (let row = 0; row < size; row += 1) {
    let start = 0;
    for (let col = 1; col <= size; col += 1) {
      if (col < size && board[row][col] !== null && board[row][col] === board[row][start]) continue;
      if (board[row][start] !== null && col - start >= 3) {
        for (let cursor = start; cursor < col; cursor += 1) matched.add(keyOf(row, cursor));
      }
      start = col;
    }
  }

  for (let col = 0; col < size; col += 1) {
    let start = 0;
    for (let row = 1; row <= size; row += 1) {
      if (row < size && board[row][col] !== null && board[row][col] === board[start][col]) continue;
      if (board[start]?.[col] !== null && row - start >= 3) {
        for (let cursor = start; cursor < row; cursor += 1) matched.add(keyOf(cursor, col));
      }
      start = row;
    }
  }
  return matched;
}

export function createsMatch(board, a, b) {
  if (!areAdjacent(a, b)) return false;
  return findMatches(swapCells(board, a, b)).size > 0;
}

export function findValidMoves(board) {
  const moves = [];
  const size = board.length;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const from = { row, col };
      for (const to of [{ row, col: col + 1 }, { row: row + 1, col }]) {
        if (to.row < size && to.col < size && createsMatch(board, from, to)) moves.push([from, to]);
      }
    }
  }
  return moves;
}

export function makeBoard(random = Math.random, size = BOARD_SIZE, typeCount = TYPE_COUNT) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const board = Array.from({ length: size }, () => Array(size).fill(0));
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const blocked = new Set();
        if (col >= 2 && board[row][col - 1] === board[row][col - 2]) blocked.add(board[row][col - 1]);
        if (row >= 2 && board[row - 1][col] === board[row - 2][col]) blocked.add(board[row - 1][col]);
        const choices = Array.from({ length: typeCount }, (_, type) => type).filter((type) => !blocked.has(type));
        board[row][col] = choices[Math.floor(random() * choices.length) % choices.length];
      }
    }
    if (findValidMoves(board).length) return board;
  }
  throw new Error('플레이 가능한 보드를 만들지 못했습니다.');
}

export function collapseBoard(board, matched, random = Math.random, typeCount = TYPE_COUNT) {
  const size = board.length;
  const next = Array.from({ length: size }, () => Array(size).fill(null));
  const spawned = [];

  for (let col = 0; col < size; col += 1) {
    const remaining = [];
    for (let row = size - 1; row >= 0; row -= 1) {
      if (!matched.has(keyOf(row, col))) remaining.push(board[row][col]);
    }
    let target = size - 1;
    for (const value of remaining) next[target--][col] = value;
    while (target >= 0) {
      const type = Math.floor(random() * typeCount) % typeCount;
      next[target][col] = type;
      spawned.push(keyOf(target, col));
      target -= 1;
    }
  }
  return { board: next, spawned: new Set(spawned) };
}

export function reshuffle(board, random = Math.random) {
  const values = board.flat();
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    const candidate = Array.from({ length: board.length }, (_, row) =>
      copy.slice(row * board.length, (row + 1) * board.length),
    );
    if (!findMatches(candidate).size && findValidMoves(candidate).length) return candidate;
  }
  return makeBoard(random, board.length, Math.max(...values) + 1);
}
