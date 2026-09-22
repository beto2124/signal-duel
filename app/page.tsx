"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Cpu,
  Flag,
  Hexagon,
  Radio,
  RotateCcw,
  Users,
  Zap,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  chooseMove,
  coordinate,
  freshGame,
  play,
  replay,
  SIZE,
  winningPath,
  type Game,
  type Player,
} from "@/lib/game";
type Mode = "practice" | "online" | "local";
type Match = {
  code: string;
  game: Game;
  joined: boolean;
  revision: number;
  you: Player;
  expiresAt: number;
};
type Session = { code: string; token: string };
async function request(path: string, body?: object, token?: string) {
  const response = await fetch(`/api/matches${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = (await response.json()) as Match & {
    token: string;
    error?: string;
  };
  if (!response.ok)
    throw new Error(
      result.error || "Connection interrupted. Please try again.",
    );
  return result;
}
export default function Home() {
  const [game, setGame] = useState<Game>(freshGame),
    [mode, setMode] = useState<Mode>("practice");
  const [session, setSession] = useState<Session | null>(null),
    [match, setMatch] = useState<Match | null>(null);
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const [review, setReview] = useState<number | null>(null),
    [focus, setFocus] = useState(24),
    [connected, setConnected] = useState(true);
  const generation = useRef(0),
    inFlight = useRef(false),
    latestRevision = useRef(-1);
  const buttonRefs = useRef<Array<SVGGElement | null>>([]),
    movesEnd = useRef<HTMLDivElement | null>(null);
  const shown = review === null ? game : replay(game.moves, review),
    path = shown.winner ? winningPath(shown.board, shown.winner) : [];
  const isThinking = mode === "practice" && game.turn === 2 && !game.winner;
  const canMove =
    review === null &&
    !game.winner &&
    !busy &&
    !isThinking &&
    (mode !== "online" || (!!match?.joined && match.you === game.turn));
  const name = (p: number) =>
    mode === "practice"
      ? p === 1
        ? "You"
        : "Circuit AI"
      : p === 1
        ? "Cyan"
        : "Amber";
  useEffect(() => {
    const invite = new URLSearchParams(location.search).get("room");
    if (invite && /^[A-Z0-9]{8}$/.test(invite)) {
      setCode(invite);
      setMode("online");
    }
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("signal-session") || "null",
      );
      if (
        saved &&
        typeof saved.code === "string" &&
        typeof saved.token === "string" &&
        (!invite || invite === saved.code)
      ) {
        setSession(saved);
        setMode("online");
      }
    } catch {}
  }, []);
  const acceptMatch = useCallback((incoming: Match) => {
    if (incoming.revision < latestRevision.current) return;
    latestRevision.current = incoming.revision;
    setMatch(incoming);
    setGame(incoming.game);
  }, []);
  useEffect(() => {
    if (mode !== "online" || !session) return;
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await request(
          `/${session.code}`,
          undefined,
          session.token,
        );
        if (!cancelled) {
          acceptMatch(result);
          setConnected(true);
        }
      } catch (e) {
        if (!cancelled) {
          setConnected(false);
          setError((e as Error).message);
        }
      }
      if (!cancelled) timer = setTimeout(poll, document.hidden ? 5000 : 1500);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, session, acceptMatch]);
  useEffect(() => {
    if (!isThinking) return;
    const timer = setTimeout(
      () =>
        setGame((current) =>
          current.turn === 2 && !current.winner
            ? play(current, chooseMove(current))
            : current,
        ),
      520,
    );
    return () => clearTimeout(timer);
  }, [isThinking, game]);
  useEffect(() => {
    const log = movesEnd.current?.parentElement;
    if (log) log.scrollTop = log.scrollHeight;
  }, [game.moves.length]);
  const changeMode = (next: string) => {
    generation.current++;
    latestRevision.current = -1;
    setMode(next as Mode);
    setGame(freshGame());
    setMatch(null);
    setSession(null);
    setReview(null);
    setError("");
    setBusy(false);
    try {
      sessionStorage.removeItem("signal-session");
    } catch {}
  };
  const move = async (cell: number) => {
    if (!canMove || inFlight.current) return;
    if (mode !== "online") {
      try {
        setGame(play(game, cell));
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    if (!session || !match) return;
    const gen = generation.current;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await request(
        `/${session.code}/move`,
        { cell, revision: match.revision },
        session.token,
      );
      if (gen === generation.current) {
        acceptMatch(result);
        setError("");
      }
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (gen === generation.current) setBusy(false);
    }
  };
  const enterRoom = async (join: boolean) => {
    if (inFlight.current) return;
    const gen = generation.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await request(
        join ? `/${code.trim().toUpperCase()}/join` : "",
        {},
      );
      if (gen !== generation.current) return;
      const next = { code: result.code, token: result.token };
      setSession(next);
      acceptMatch(result);
      try {
        sessionStorage.setItem("signal-session", JSON.stringify(next));
      } catch {}
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (gen === generation.current) setBusy(false);
    }
  };
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/?room=${match!.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Copy this room code to invite a friend: ${match!.code}`);
    }
  };
  const reset = () => {
    setGame(freshGame());
    setReview(null);
    setError("");
  };
  const status =
    review !== null
      ? `Reviewing move ${review}`
      : game.winner
        ? `${name(game.winner)} ${mode === "practice" && game.winner === 1 ? "win" : "wins"}!`
        : mode === "online" && !match
          ? "Bring a worthy opponent."
          : mode === "online" && !match?.joined
            ? "Waiting for your opponent…"
            : isThinking
              ? "Circuit is thinking…"
              : mode === "practice"
                ? "Your move. Make it count."
                : `${name(game.turn)} to move.`;
  const snapshot = useRef({ mode, game, code: match?.code || null });
  snapshot.current = { mode, game, code: match?.code || null };
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: "read_signal_duel_match",
            description:
              "Read the visible Signal Duel board, turn, and move history. Does not make a move.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                Object.keys(input).length
              )
                throw new Error("Expected an empty object.");
              return snapshot.current;
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Signal Duel home">
          <span className="brand-icon">
            <Hexagon size={23} />
            <Zap size={12} />
          </span>
          SIGNAL<span className="brand-light">DUEL</span>
        </a>
        <div className="edition">
          THE CONNECTION GAME <span>/ 01</span>
        </div>
        <a className="rules-link" href="#how-to-play">
          How to play <ArrowUpRight size={16} />
        </a>
      </header>
      <main>
        <div className="title-row">
          <div>
            <div className="eyebrow">
              <span /> EVERY MOVE IS A CONNECTION
            </div>
            <h1>Find your way through.</h1>
            <p>One board. Two signals. No room for a draw.</p>
          </div>
          <div className="board-spec">
            <Hexagon size={18} />
            <span>
              7 × 7<br />
              <small>HEX ARENA</small>
            </span>
          </div>
        </div>
        <div className="game-layout">
          <section className="arena" aria-label="Game arena">
            <div className="arena-toolbar">
              <Tabs value={mode} onValueChange={changeMode}>
                <TabsList aria-label="Game mode" className="mode-tabs">
                  <TabsTrigger value="practice">
                    <Cpu size={16} />
                    Practice
                  </TabsTrigger>
                  <TabsTrigger value="online">
                    <Radio size={16} />
                    Online
                  </TabsTrigger>
                  <TabsTrigger value="local">
                    <Users size={16} />
                    Local duel
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="move-count">
                MOVE {String(game.moves.length).padStart(2, "0")}
              </span>
            </div>
            <div className="arena-status" aria-live="polite">
              <div className={`turn-mark p${shown.winner || game.turn}`}>
                <Zap size={18} />
              </div>
              <div>
                <h2>{status}</h2>
                <p>
                  {review !== null
                    ? "Step through the match below."
                    : game.winner
                      ? "An unbroken connection. A well-played match."
                      : mode === "online"
                        ? match
                          ? `Room ${match.code} · You are ${match.you === 1 ? "Cyan" : "Amber"}${connected ? "" : " · Reconnecting"}`
                          : "Create a private room or join with a code."
                        : "Claim a hex. Connect your two colored edges."}
                </p>
              </div>
              {game.winner ? (
                <Flag className="win-flag" size={23} />
              ) : (
                <span className="turn-pip" />
              )}
            </div>
            <div className="board-wrap">
              <svg
                className="hex-board"
                viewBox="70 0 560 430"
                role="group"
                aria-label="Hex board. Cyan connects left to right. Amber connects top to bottom. Use arrow keys to navigate, Enter or Space to claim a cell."
              >
                <defs>
                  <pattern
                    id="dots"
                    width="20"
                    height="20"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="1" cy="1" r="0.7" fill="#26323b" />
                  </pattern>
                </defs>
                <rect width="680" height="430" fill="url(#dots)" />
                <path
                  d="M 130 46 L 440 46 M 255 376 L 564 376"
                  className="edge amber-edge"
                />
                <path
                  d="M 98 83 L 223 347 M 478 83 L 603 347"
                  className="edge cyan-edge"
                />
                <text x="281" y="27" className="edge-label amber-text">
                  AMBER · TOP TO BOTTOM
                </text>
                <text x="340" y="416" className="edge-label cyan-text">
                  CYAN · LEFT TO RIGHT
                </text>
                {shown.board.map((owner, i) => {
                  const row = Math.floor(i / SIZE),
                    col = i % SIZE,
                    x = 136 + col * 47 + row * 23.5,
                    y = 82 + row * 43;
                  const points = Array.from({ length: 6 }, (_, k) => {
                    const angle = ((60 * k - 30) * Math.PI) / 180;
                    return `${x + 26 * Math.cos(angle)},${y + 26 * Math.sin(angle)}`;
                  }).join(" ");
                  const latest = shown.moves.at(-1)?.cell === i,
                    won = path.includes(i);
                  return (
                    <g
                      key={i}
                      ref={(el) => {
                        buttonRefs.current[i] = el;
                      }}
                      role="button"
                      tabIndex={focus === i ? 0 : -1}
                      aria-disabled={!!owner || !canMove}
                      aria-label={`${coordinate(i)}, ${owner === 1 ? "Cyan" : owner === 2 ? "Amber" : "empty"}${latest ? ", last move" : ""}`}
                      className={`hex-cell owner-${owner} ${won ? "winning" : ""} ${!owner && canMove ? "playable" : ""}`}
                      onFocus={() => setFocus(i)}
                      onClick={() => !owner && void move(i)}
                      onKeyDown={(e) => {
                        if (["Enter", " "].includes(e.key)) {
                          e.preventDefault();
                          if (!owner) void move(i);
                          return;
                        }
                        const delta: Record<string, number> = {
                          ArrowLeft: -1,
                          ArrowRight: 1,
                          ArrowUp: -SIZE,
                          ArrowDown: SIZE,
                        };
                        if (e.key in delta) {
                          e.preventDefault();
                          const target = Math.max(
                            0,
                            Math.min(48, i + delta[e.key]),
                          );
                          setFocus(target);
                          buttonRefs.current[target]?.focus();
                        }
                      }}
                    >
                      <polygon points={points} />
                      {owner ? (
                        <>
                          <circle cx={x} cy={y} r={latest ? 7 : 4} />
                          {latest && (
                            <circle
                              className="last-ring"
                              cx={x}
                              cy={y}
                              r="13"
                            />
                          )}
                        </>
                      ) : (
                        <text x={x} y={y + 4}>
                          {coordinate(i)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="arena-footer">
              <span>
                <span className="legend-dot cyan" />
                CYAN <ArrowLeftRight size={14} />
              </span>
              <p>
                {mode === "practice"
                  ? "You play cyan. Circuit plays amber."
                  : "Connect your edges before your opponent."}
              </p>
              <span>
                <span className="legend-dot amber" />
                AMBER <ArrowDown size={14} />
              </span>
            </div>
            {error && (
              <div className="error-box" role="alert">
                {error}
                <button
                  onClick={() => setError("")}
                  aria-label="Dismiss message"
                >
                  ×
                </button>
              </div>
            )}
          </section>
          <aside className="sidebar">
            <section className="match-panel">
              <div className="section-label">
                {mode === "online" ? "PRIVATE MATCH" : "THE MATCHUP"}
                <span>01</span>
              </div>
              {mode === "online" && !session ? (
                <div className="room-setup">
                  <h3>A little friendly rivalry.</h3>
                  <p>Share a room and play from two devices.</p>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void enterRoom(false)}
                  >
                    <Radio size={16} />
                    {busy ? "Connecting…" : "Create a room"}
                  </button>
                  <div className="or-divider">OR JOIN A FRIEND</div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void enterRoom(true);
                    }}
                  >
                    <label htmlFor="room-code">Room code</label>
                    <input
                      id="room-code"
                      value={code}
                      onChange={(e) =>
                        setCode(
                          e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, 8),
                        )
                      }
                      maxLength={8}
                      placeholder="8-character code"
                      autoComplete="off"
                    />
                    <button
                      className="secondary-button"
                      disabled={busy || code.length !== 8}
                    >
                      Join room <ArrowUpRight size={16} />
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  <div
                    className={`player-card ${game.turn === 1 && !game.winner ? "active-player" : ""}`}
                  >
                    <span className="avatar cyan-avatar">
                      <Zap size={23} />
                    </span>
                    <div>
                      <strong>{name(1)}</strong>
                      <small>Cyan / West → East</small>
                    </div>
                    <span className="player-number">P1</span>
                  </div>
                  <div className="versus">
                    <span />
                    VS
                    <span />
                  </div>
                  <div
                    className={`player-card ${game.turn === 2 && !game.winner ? "active-player amber-active" : ""}`}
                  >
                    <span className="avatar amber-avatar">
                      {mode === "practice" ? (
                        <Cpu size={23} />
                      ) : (
                        <Zap size={23} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {mode === "online" && !match?.joined
                          ? "Open seat"
                          : name(2)}
                      </strong>
                      <small>Amber / North → South</small>
                    </div>
                    <span className="player-number">P2</span>
                  </div>
                  {mode === "online" && match ? (
                    <div className="invite">
                      <span>ROOM CODE</span>
                      <button onClick={() => void copyInvite()}>
                        {match.code}
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                      <p>
                        {copied
                          ? "Invite link copied."
                          : "Tap to copy an invite link."}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => changeMode("online")}
                      >
                        Leave room
                      </button>
                    </div>
                  ) : (
                    <button
                      className="secondary-button new-match"
                      onClick={reset}
                    >
                      <RotateCcw size={15} />
                      New match
                    </button>
                  )}
                </>
              )}
            </section>
            <section className="history-panel">
              <div className="section-label">
                MOVE LOG
                <span>{String(game.moves.length).padStart(2, "0")}</span>
              </div>
              <div className="move-log">
                {!game.moves.length ? (
                  <div className="empty-log">
                    <span className="empty-line" />
                    <p>
                      Every great connection
                      <br />
                      starts with a single move.
                    </p>
                  </div>
                ) : (
                  game.moves.map((m, i) => (
                    <button
                      className={`log-row ${review === i + 1 ? "selected-log" : ""}`}
                      key={i}
                      onClick={() => setReview(i + 1)}
                      aria-label={`Review move ${i + 1}: ${name(m.player)} at ${coordinate(m.cell)}`}
                    >
                      <span className="log-index">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`legend-dot ${m.player === 1 ? "cyan" : "amber"}`}
                      />
                      <span>{name(m.player)}</span>
                      <strong>{coordinate(m.cell)}</strong>
                    </button>
                  ))
                )}
                <div ref={movesEnd} />
              </div>
              {!!game.moves.length && (
                <div className="replay-controls">
                  <div>
                    <button
                      aria-label="Previous move"
                      disabled={(review ?? game.moves.length) === 0}
                      onClick={() =>
                        setReview(
                          Math.max(0, (review ?? game.moves.length) - 1),
                        )
                      }
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <span>
                      {review === null
                        ? "MATCH REPLAY"
                        : `${review} / ${game.moves.length}`}
                    </span>
                    <button
                      aria-label="Next move"
                      disabled={review === null || review >= game.moves.length}
                      onClick={() =>
                        setReview(
                          Math.min(game.moves.length, (review ?? 0) + 1),
                        )
                      }
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                  <Slider
                    aria-label="Replay move"
                    value={[review ?? game.moves.length]}
                    max={game.moves.length}
                    step={1}
                    onValueChange={(value) => setReview(value[0])}
                  />
                  {review !== null && (
                    <button
                      className="text-button"
                      onClick={() => setReview(null)}
                    >
                      Return to match
                    </button>
                  )}
                </div>
              )}
            </section>
          </aside>
        </div>
        <section className="rules" id="how-to-play">
          <div className="rules-heading">
            <span className="eyebrow">SIMPLE RULES. DEEP POSSIBILITIES.</span>
            <h2>
              Build a connection.
              <br />
              Break their plan.
            </h2>
          </div>
          <div className="rule">
            <span>01 / CLAIM</span>
            <p>
              Take turns choosing an empty hex. Once claimed, it’s yours for the
              match.
            </p>
          </div>
          <div className="rule">
            <span>02 / CONNECT</span>
            <p>
              Link neighboring hexes to join your two colored edges. Cyan goes
              across. Amber goes down.
            </p>
          </div>
          <div className="rule">
            <span>03 / OUTTHINK</span>
            <p>
              Block a route. Build a bridge. The first unbroken connection wins.
              There are no draws.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <span>SIGNAL DUEL</span>
        <p>A game of small moves and long connections.</p>
        <span>
          BUILT TO CONNECT <Hexagon size={13} />
        </span>
      </footer>
    </div>
  );
}
