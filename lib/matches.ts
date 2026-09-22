import { env } from "cloudflare:workers";
import { freshGame, play, type Game, type Player } from "./game";

type Row = {
  code: string;
  host_hash: string;
  guest_hash: string | null;
  state: string;
  revision: number;
  expires_at: number;
};
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
function db(): D1Database {
  if (!env.DB) throw new Error("D1 unavailable");
  return env.DB;
}
const hash = async (token: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const newToken = () => crypto.randomUUID() + crypto.randomUUID();
const codePattern = /^[A-Z2-9]{8}$/;
function newCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (b) => alphabet[b % 32],
  ).join("");
}
function publicMatch(row: Row, you: Player) {
  return {
    code: row.code,
    game: JSON.parse(row.state) as Game,
    joined: !!row.guest_hash,
    revision: row.revision,
    you,
    expiresAt: row.expires_at,
  };
}
function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function read(code: string) {
  if (!codePattern.test(code))
    throw new HttpError(400, "Enter a valid 8-character room code.");
  const row = await db()
    .prepare("SELECT * FROM matches WHERE code = ? AND expires_at > ?")
    .bind(code, Date.now())
    .first<Row>();
  if (!row)
    throw new HttpError(404, "Room not found or expired. Create a new room.");
  return row;
}
async function identify(request: Request, row: Row): Promise<Player> {
  const token =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  if (token.length !== 72)
    throw new HttpError(
      401,
      "Rejoin this room from the browser where you started.",
    );
  const digest = await hash(token);
  if (digest === row.host_hash) return 1;
  if (digest === row.guest_hash) return 2;
  throw new HttpError(403, "This session does not belong to the room.");
}
async function body(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, "Cross-origin requests are not accepted.");
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    throw new HttpError(415, "Send a JSON request.");
  // Bound streamed bodies too; do not trust Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON object is required.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 2048) {
      await reader.cancel();
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "A valid JSON object is required.");
  }
}
export async function handle(
  request: Request,
  action: "create" | "join" | "read" | "move",
  code = "",
) {
  try {
    if (action === "create") {
      await body(request);
      const token = newToken(),
        digest = await hash(token),
        expires = Date.now() + 86400000;
      // Expiration is enforced on every access; bounded opportunistic cleanup limits storage growth.
      await db()
        .prepare(
          "DELETE FROM matches WHERE code IN (SELECT code FROM matches WHERE expires_at < ? LIMIT 100)",
        )
        .bind(Date.now())
        .run();
      for (let tries = 0; tries < 5; tries++) {
        const room = newCode();
        const result = await db()
          .prepare(
            "INSERT OR IGNORE INTO matches (code,host_hash,state,revision,expires_at) VALUES (?,?,?,0,?)",
          )
          .bind(room, digest, JSON.stringify(freshGame()), expires)
          .run();
        if (result.meta.changes)
          return json(
            {
              ...publicMatch(
                {
                  code: room,
                  host_hash: digest,
                  guest_hash: null,
                  state: JSON.stringify(freshGame()),
                  revision: 0,
                  expires_at: expires,
                },
                1,
              ),
              token,
            },
            201,
          );
      }
      throw new Error("Room allocation failed");
    }
    if (action === "join") {
      await body(request);
      const row = await read(code);
      if (row.guest_hash)
        throw new HttpError(409, "This room already has two players.");
      const token = newToken(),
        digest = await hash(token);
      const result = await db()
        .prepare(
          "UPDATE matches SET guest_hash = ?, revision = revision + 1 WHERE code = ? AND guest_hash IS NULL AND expires_at > ?",
        )
        .bind(digest, code, Date.now())
        .run();
      if (!result.meta.changes)
        throw new HttpError(
          409,
          "Another player took this seat. Create a new room.",
        );
      return json({ ...publicMatch(await read(code), 2), token });
    }
    const row = await read(code),
      you = await identify(request, row);
    if (action === "read") return json(publicMatch(row, you));
    const payload = await body(request);
    if (!row.guest_hash)
      throw new HttpError(409, "Wait for your opponent to join.");
    if (!Number.isInteger(payload.cell) || !Number.isInteger(payload.revision))
      throw new HttpError(400, "A cell and match revision are required.");
    if (payload.revision !== row.revision)
      throw new HttpError(
        409,
        "The board changed. Wait for it to refresh and try again.",
      );
    let next: Game;
    try {
      next = play(JSON.parse(row.state), payload.cell as number, you);
    } catch (e) {
      throw new HttpError(409, (e as Error).message);
    }
    // Compare-and-swap serializes simultaneous writes, preventing duplicate or lost moves.
    const result = await db()
      .prepare(
        "UPDATE matches SET state = ?, revision = revision + 1 WHERE code = ? AND revision = ? AND expires_at > ?",
      )
      .bind(JSON.stringify(next), code, row.revision, Date.now())
      .run();
    if (!result.meta.changes)
      throw new HttpError(
        409,
        "The board changed. Wait for it to refresh and try again.",
      );
    return json(
      publicMatch(
        { ...row, state: JSON.stringify(next), revision: row.revision + 1 },
        you,
      ),
    );
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(
      "Match operation failed",
      action,
      e instanceof Error ? e.message : "Unknown error",
    );
    return json(
      {
        error:
          "Online matches are temporarily unavailable. Try again, or play Practice.",
      },
      503,
    );
  }
}
