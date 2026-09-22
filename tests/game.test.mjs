import test from "node:test";
import assert from "node:assert/strict";
import {
  freshGame,
  play,
  winningPath,
  neighbors,
  chooseMove,
  connectionCost,
  replay,
} from "../lib/game.ts";

test("hex adjacency is symmetric and never wraps around an edge", () => {
  assert.deepEqual(neighbors(0), [1, 7]);
  assert.deepEqual(neighbors(48), [41, 47]);
  assert.equal(neighbors(24).length, 6);
  for (let i = 0; i < 49; i++)
    for (const next of neighbors(i)) assert.ok(neighbors(next).includes(i));
});
test("moves are immutable and validate boundaries, ownership and turn", () => {
  const original = freshGame(),
    next = play(original, 24);
  assert.equal(original.board[24], 0);
  assert.equal(next.board[24], 1);
  assert.equal(next.turn, 2);
  for (const bad of [-1, 49, 1.2, NaN, "2"])
    assert.throws(() => play(original, bad));
  assert.throws(() => play(next, 24));
  assert.throws(() => play(next, 25, 1));
});
test("both players connect the correct edges, not the opposite pair", () => {
  const horizontal = Array(49).fill(0);
  for (let i = 21; i < 28; i++) horizontal[i] = 1;
  assert.equal(winningPath(horizontal, 1).length, 7);
  assert.equal(winningPath(horizontal, 2).length, 0);
  const vertical = Array(49).fill(0);
  for (let i = 0; i < 7; i++) vertical[i * 7 + 3] = 2;
  assert.equal(winningPath(vertical, 2).length, 7);
  assert.equal(winningPath(vertical, 1).length, 0);
  horizontal[24] = 0;
  assert.equal(winningPath(horizontal, 1).length, 0);
});
test("AI takes immediate wins and blocks immediate losses", () => {
  const game = freshGame();
  for (let i = 0; i < 6; i++) game.board[i] = 1;
  assert.equal(chooseMove(game), 6);
  game.turn = 2;
  assert.equal(chooseMove(game), 6);
});
test("Dijkstra counts missing cells and detects blocked routes", () => {
  const board = freshGame().board;
  assert.equal(connectionCost(board, 1), 7);
  for (let i = 0; i < 7; i++) board[i * 7 + 3] = 2;
  assert.equal(connectionCost(board, 1), Infinity);
  assert.equal(connectionCost(board, 2), 0);
});
test("replay reproduces the full state, and finished matches reject moves", () => {
  let game = freshGame();
  for (let i = 0; i < 6; i++) {
    game = play(game, i);
    game = play(game, 42 + i);
  }
  game = play(game, 6);
  assert.equal(game.winner, 1);
  assert.throws(() => play(game, 20));
  assert.deepEqual(replay(game.moves, game.moves.length), game);
  assert.deepEqual(replay(game.moves, 0), freshGame());
  assert.equal(replay(game.moves, 5).moves.length, 5);
});
test("250 seeded random complete boards have exactly one winner", () => {
  let seed = 731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let trial = 0; trial < 250; trial++) {
    const board = Array.from({ length: 49 }, () => (random() < 0.5 ? 1 : 2));
    assert.equal(
      Number(!!winningPath(board, 1).length) +
        Number(!!winningPath(board, 2).length),
      1,
    );
  }
});
test("AI versus AI terminates with legal moves and a winner", () => {
  let game = freshGame();
  while (!game.winner && game.moves.length < 49)
    game = play(game, chooseMove(game));
  assert.ok(game.winner);
  assert.ok(game.moves.length <= 49);
});
