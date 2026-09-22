/** Pure rules shared by browser, AI, server, and tests. */
export const SIZE = 7;
export type Player = 1 | 2;
export type Cell = 0 | Player;
export type Move = { cell: number; player: Player };
export type Game = { board: Cell[]; moves: Move[]; turn: Player; winner: Cell };
export const freshGame = (): Game => ({
  board: Array(49).fill(0),
  moves: [],
  turn: 1,
  winner: 0,
});
export const other = (p: Player): Player => (p === 1 ? 2 : 1);
export const coordinate = (cell: number) =>
  `${String.fromCharCode(65 + (cell % SIZE))}${Math.floor(cell / SIZE) + 1}`;
export function neighbors(cell: number): number[] {
  const r = Math.floor(cell / SIZE),
    c = cell % SIZE;
  return [
    [r - 1, c],
    [r - 1, c + 1],
    [r, c - 1],
    [r, c + 1],
    [r + 1, c - 1],
    [r + 1, c],
  ]
    .filter(([y, x]) => y >= 0 && x >= 0 && y < SIZE && x < SIZE)
    .map(([y, x]) => y * SIZE + x);
}
const starts = (p: Player) =>
  Array.from({ length: SIZE }, (_, i) => (p === 1 ? i * SIZE : i));
const atEnd = (cell: number, p: Player) =>
  p === 1 ? cell % SIZE === SIZE - 1 : Math.floor(cell / SIZE) === SIZE - 1;
/** BFS returns the winning chain for highlighting. */
export function winningPath(board: Cell[], p: Player): number[] {
  const queue = starts(p).filter((i) => board[i] === p),
    parent = new Map<number, number>();
  queue.forEach((i) => parent.set(i, -1));
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    if (atEnd(cell, p)) {
      const path: number[] = [];
      let cursor = cell;
      while (cursor !== -1) {
        path.push(cursor);
        cursor = parent.get(cursor)!;
      }
      return path.reverse();
    }
    for (const next of neighbors(cell))
      if (board[next] === p && !parent.has(next)) {
        parent.set(next, cell);
        queue.push(next);
      }
  }
  return [];
}
export function play(game: Game, cell: number, player = game.turn): Game {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 49)
    throw new Error("Choose a cell on the board.");
  if (game.winner) throw new Error("This match has finished.");
  if (player !== game.turn) throw new Error("Wait for your turn.");
  if (game.board[cell]) throw new Error("That cell is already claimed.");
  const board = [...game.board];
  board[cell] = player;
  return {
    board,
    moves: [...game.moves, { cell, player }],
    turn: other(player),
    winner: winningPath(board, player).length ? player : 0,
  };
}
/** Dijkstra: own cells cost 0, empty cells 1, enemies are impassable. */
export function connectionCost(board: Cell[], p: Player): number {
  const cost = Array(49).fill(Infinity),
    visited = new Set<number>();
  for (const i of starts(p))
    cost[i] = board[i] === other(p) ? Infinity : board[i] === p ? 0 : 1;
  while (visited.size < 49) {
    let best = -1;
    for (let i = 0; i < 49; i++)
      if (!visited.has(i) && (best === -1 || cost[i] < cost[best])) best = i;
    if (best === -1 || cost[best] === Infinity) return Infinity;
    if (atEnd(best, p)) return cost[best];
    visited.add(best);
    for (const n of neighbors(best))
      if (board[n] !== other(p))
        cost[n] = Math.min(cost[n], cost[best] + (board[n] === p ? 0 : 1));
  }
  return Infinity;
}
/** Route heuristic with immediate win/block checks; deterministic tie breaks. */
export function chooseMove(game: Game): number {
  const legal = game.board
    .map((v, i) => (v === 0 ? i : -1))
    .filter((i) => i >= 0);
  if (game.winner || !legal.length) throw new Error("No legal moves remain.");
  const p = game.turn,
    enemy = other(p);
  for (const cell of legal) {
    const board = [...game.board];
    board[cell] = p;
    if (winningPath(board, p).length) return cell;
  }
  for (const cell of legal) {
    const board = [...game.board];
    board[cell] = enemy;
    if (winningPath(board, enemy).length) return cell;
  }
  let best = legal[0],
    bestScore = -Infinity;
  for (const cell of legal) {
    const board = [...game.board];
    board[cell] = p;
    const center =
      Math.abs(Math.floor(cell / SIZE) - 3) + Math.abs((cell % SIZE) - 3);
    const score =
      Math.min(50, connectionCost(board, enemy)) * 1.15 -
      Math.min(50, connectionCost(board, p)) * 1.4 -
      center * 0.035;
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return best;
}
export function replay(moves: Move[], count: number): Game {
  return moves
    .slice(0, count)
    .reduce((s, m) => play(s, m.cell, m.player), freshGame());
}
