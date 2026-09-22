// Explicit local integration test; never targets production accidentally.
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://localhost:5173";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname))
  throw new Error("API tests require a local server.");
let checks = 0;
async function call(path, body, token, status = 200) {
  const response = await fetch(`${base}/api/matches${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  checks++;
  return data;
}
const host = await call("", {}, null, 201);
await call(`/${host.code}`, undefined, null, 401);
await call(`/${host.code}`, undefined, "x".repeat(72), 403);
await call(`/${host.code}/move`, { cell: 0, revision: 0 }, host.token, 409);
const guests = await Promise.all(
  [1, 2].map(() =>
    fetch(`${base}/api/matches/${host.code}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  ),
);
assert.deepEqual(guests.map((r) => r.status).sort(), [200, 409]);
checks++;
const guest = await guests.find((r) => r.status === 200).json();
const current = await call(`/${host.code}`, undefined, host.token);
assert.equal(current.joined, true);
assert.equal(current.revision, 1);
assert.ok(!("host_hash" in current) && !("token" in current));
await call(`/${host.code}/move`, { cell: 0, revision: 1 }, guest.token, 409);
await call(`/${host.code}/move`, { cell: 0.2, revision: 1 }, host.token, 400);
const racing = await Promise.all(
  [0, 1].map((cell) =>
    fetch(`${base}/api/matches/${host.code}/move`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${host.token}`,
      },
      body: JSON.stringify({ cell, revision: 1 }),
    }),
  ),
);
assert.deepEqual(racing.map((r) => r.status).sort(), [200, 409]);
checks++;
const after = await call(`/${host.code}`, undefined, guest.token);
assert.equal(after.game.moves.length, 1);
await call(`/${host.code}/move`, { cell: 20, revision: 1 }, guest.token, 409);
await call(
  `/${host.code}/move`,
  { cell: after.game.moves[0].cell, revision: after.revision },
  guest.token,
  409,
);
const next = await call(
  `/${host.code}/move`,
  { cell: 48, revision: after.revision },
  guest.token,
);
assert.equal(next.game.moves.length, 2);
assert.equal(next.game.turn, 1);
// A full match verifies server victory calculation and replay data.
const h = await call("", {}, null, 201),
  g = await call(`/${h.code}/join`, {});
let revision = 1,
  state;
for (let i = 0; i < 6; i++) {
  state = await call(
    `/${h.code}/move`,
    { cell: i, revision: revision++ },
    h.token,
  );
  state = await call(
    `/${h.code}/move`,
    { cell: 42 + i, revision: revision++ },
    g.token,
  );
}
state = await call(
  `/${h.code}/move`,
  { cell: 6, revision: revision++ },
  h.token,
);
assert.equal(state.game.winner, 1);
await call(`/${h.code}/move`, { cell: 20, revision }, g.token, 409);
console.log(
  `Passed ${checks} API checks, including simultaneous joins, simultaneous moves, authorization, stale revisions, and a complete match.`,
);
