# Signal Duel

A multiplayer Hex strategy game: claim cells, block routes, and connect opposite edges before your opponent. Cyan plays west to east; amber plays north to south.

**React · TypeScript · Cloudflare Workers · D1 / SQLite · graph algorithms**

## Play locally

On this Windows computer, double-click **START-GAME.cmd**, keep its window open, and visit **http://localhost:5173**. The launcher uses the bundled modern Node runtime when available. If the preview is already running in Codex, just open the URL.

On another computer, install Node.js **24 LTS** (or 22.18+) and run:

```sh
npm ci
npm run build
npm run db:local
npm run dev
```

The first installation needs internet access. After that, practice and local play need no external API keys, paid AI service, or account. Online rooms use the local D1 emulator during development.

Choose **Practice** for Circuit AI, **Local duel** to take turns on one screen, or **Online** to create a room. To test two independent players locally, join from a separate browser/private window using the room code. A localhost invite works only on this computer. Play across the internet requires deployment; this project does not yet have a live hosted URL.

## What works

- A responsive SVG hex board, keyboard navigation, player turns, and winning-path highlighting.
- AI with shortest-path evaluation, immediate-win detection, and threat blocking.
- Two-player rooms, invite links, persistent online state, and server-side move validation.
- Atomic room joining and optimistic concurrency: racing requests cannot claim the same seat or overwrite a move.
- Polling every 1.5 seconds; hidden tabs poll every 5 seconds. Old responses cannot roll back a newer board.
- Replay any point in a match, then return to live play.
- Reconnect an online seat after refreshing the same tab. Only its secret seat token is kept in session storage; the authoritative board is in D1.
- A read-only WebMCP tool exposes the current visible board in supported browsers.

Online rooms expire after 24 hours. Expiration is enforced on every access; new room creation cleans up at most 100 expired records. Practice and local games are intentionally temporary and reset on reload. Switching modes or leaving a room discards the local seat credential; the abandoned seat remains occupied until expiration. A lost create/join response may require making a new room.

## Check the project

```sh
npm test
npm run typecheck
npm run build
# With a local dev server running:
npm run test:api
```

The included tests cover adjacency, invalid moves, both win directions, AI win/block behavior, shortest-path cost, replay, and 250 seeded complete-board checks. API tests exercise real local D1 through HTTP, including concurrent joins and moves, authorization, stale revisions, and a full match. Integration tests refuse non-local URLs. The GitHub Actions workflow runs unit tests, type checking, and the build; it does not claim to run the HTTP integration suite.

## Read the code

| File | Purpose |
| --- | --- |
| `lib/game.ts` | Pure game engine, BFS win detection, Dijkstra route evaluation, AI |
| `lib/matches.ts` | HTTP validation, seat authorization, D1 operations, atomic updates |
| `app/api/matches/` | Thin API route adapters |
| `app/page.tsx` | Board, modes, polling, replay, keyboard controls |
| `app/globals.css` | Responsive arcade theme |
| `db/schema.ts`, `drizzle/` | Typed schema and versioned migration |
| `tests/` | Rules and HTTP integration checks |
| `docs/INTERVIEW-GUIDE.md` | Architecture, tradeoffs, demo script, résumé guidance |

The project uses the Sites Vinext starter, with its existing UI primitives and Worker build integration. Supporting starter components are preserved; most are not used by the game. Hex is an established board game; Signal Duel's implementation and presentation are the project, not an invented ruleset.

## Deployment status

**Local build and multiplayer are verified. Hosted deployment is incomplete.** A private Sites project was registered, but the local Sites publishing component became unavailable before source publication. No live URL or production deployment is claimed. The existing `.openai/hosting.json` contains the registered project's ID: reuse it when resuming in Sites; do not register another copy of this same site.

For a public portfolio demo, deliberately choose the public audience only after reviewing abuse protections. This prototype has seat authorization, prepared SQL, bounded request bodies, and race protection, but no application rate limiter, matchmaking service, account system, or production load-test results. See the interview guide for limitations and extension ideas.

## Make it your portfolio project

Read the engine and server code, run the tests, and make at least one substantive improvement you can explain. Add your own GitHub repository URL and a live demo URL after you publish them. The source archive excludes dependencies, runtime data, and credentials. Be accurate about AI assistance and your own contributions. Use the suggested résumé wording in the interview guide only after you have worked through the implementation.
