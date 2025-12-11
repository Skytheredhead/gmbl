"use client";

import { useCallback, useEffect, useState } from "react";
import { glassPanelClass, primaryButtonGradient } from "../theme";
import { createClient } from "@supabase/supabase-js";
import { useWalletBalance } from "../hooks/useSupabaseWallet";

export default function GmblLobby() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState<string[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [channel, setChannel] = useState<any>(null);
  const [wallet, , walletState] = useWalletBalance({ mode: "multiplayer", initialBalance: 100 });
  const { loading: walletLoading } = walletState;
  const [displayWallet, setDisplayWallet] = useState(wallet);
  const walletDisplay = walletLoading ? "---" : `$${displayWallet.toLocaleString()}`;

  const navigate = (path: string) => {
    if (typeof window !== "undefined") {
      window.location.href = path;
    }
  };

  // establish or generate lobby code and determine host
  useEffect(() => {
    const url = new URL(window.location.href);
    const storedCode = sessionStorage.getItem("gmbl-code");
    const storedName = sessionStorage.getItem("gmbl-name");
    const storedHost = sessionStorage.getItem("gmbl-host");
    let c = url.searchParams.get("code");
    let host = !c;
    if (storedCode && storedName) {
      c = storedCode;
      host = storedHost === "1";
      setName(storedName);
      setJoined(true);
      const sel = sessionStorage.getItem("gmbl-selected");
      if (sel) {
        const g = games.find((x) => x.label === sel);
        if (g) setSelectedGame(g);
      }
      url.searchParams.set("code", c);
      window.history.replaceState({}, "", url.toString());
    } else if (!c) {
      c = Math.floor(1000 + Math.random() * 9000).toString();
      url.searchParams.set("code", c);
      window.history.replaceState({}, "", url.toString());
    }
    setCode(c!);
    setIsHost(host);
  }, []);

  // subscribe to presence once a name is provided
  useEffect(() => {
    if (!joined || !code) return;
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supaUrl || !supaKey) return;
    const supabase = createClient(supaUrl, supaKey);
    const ch = supabase.channel(`gmbl-lobby-${code}`, {
      config: { presence: { key: name } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const names = Object.values(state).map((arr: any) => arr[0]?.username as string);
      setPlayers(names);
    });

    ch.on("broadcast", { event: "start" }, ({ payload }) => {
      const gamePath = payload?.game as string | undefined;
      if (gamePath) {
        navigate(`${gamePath}?code=${code}`);
      }
    });

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        const state = ch.presenceState();
        if (state[name]) {
          alert("name already taken");
          sessionStorage.removeItem("gmbl-name");
          sessionStorage.removeItem("gmbl-host");
          sessionStorage.removeItem("gmbl-code");
          ch.unsubscribe();
          setJoined(false);
          return;
        }
        ch.track({ username: name });
      }
    });

    setChannel(ch);

    return () => {
      ch.unsubscribe();
    };
  }, [joined, name, code]);

  const onJoin = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed) {
      sessionStorage.setItem("gmbl-name", trimmed);
      sessionStorage.setItem("gmbl-host", isHost ? "1" : "0");
      sessionStorage.setItem("gmbl-code", code);
      setJoined(true);
    }
  }, [code, isHost, name]);

  useEffect(() => {
    if (joined) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") onJoin();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [joined, name, onJoin]);

  const canStart = isHost && joined && selectedGame && players.length > 1;

  const startGame = () => {
    if (!canStart || !channel || !selectedGame) return;
    channel
      .send({ type: "broadcast", event: "start", payload: { game: selectedGame.path } })
      .then(() => navigate(`${selectedGame.path}?code=${code}`));
  };

  useEffect(() => {
    let frame: number;
    const start = displayWallet;
    const end = wallet;
    const duration = 500;
    const startTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const progress = Math.min((now - startTime) / duration, 1);
      setDisplayWallet(Math.round(start + (end - start) * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [displayWallet, wallet]);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 pb-24 pt-24 text-white sm:px-6">
      <a
        href="/"
        className="absolute left-6 top-6 text-3xl font-black tracking-tight text-white transition hover:text-cyan-200"
      >
        <span className="bg-gradient-to-br from-white via-sky-100 to-cyan-200 bg-clip-text text-transparent">gmbl</span>
      </a>
      <div className="absolute right-6 top-6 flex flex-col items-end gap-2 text-right text-white/70">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white/70 shadow-lg backdrop-blur">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-6 w-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
            />
          </svg>
          <span className="text-white">{walletDisplay}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_680px_at_50%_-10%,rgba(255,255,255,0.08),transparent),radial-gradient(900px_580px_at_10%_85%,rgba(45,212,191,0.14),transparent),radial-gradient(900px_580px_at_90%_88%,rgba(129,140,248,0.15),transparent)]" />
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-6xl items-center justify-center px-2 sm:px-6">
        <div
          className={`${glassPanelClass} relative w-full max-w-5xl rounded-[36px] border-white/15 bg-slate-950/70 px-8 py-12 shadow-[0_48px_160px_rgba(15,23,42,0.6)] backdrop-blur-xl sm:px-12`}
        >
          <div className="flex flex-col gap-10">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex max-w-xl flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.35em] text-white/45">Multiplayer</span>
                <h1 className="text-4xl font-semibold text-white sm:text-5xl">Lobby</h1>
                <p className="text-sm text-white/60">
                  Share your code, gather your crew, and pick the table you want to play together.
                </p>
              </div>
              <div className="rounded-3xl border border-white/12 bg-white/8 px-6 py-5 text-right shadow-[0_24px_90px_rgba(15,23,42,0.45)]">
                <div className="text-xs uppercase tracking-[0.3em] text-white/55">Game code</div>
                <div className="mt-2 text-4xl font-mono tracking-[0.3em] text-white">{code || "----"}</div>
              </div>
            </div>

            {!joined ? (
              <div className="grid w-full gap-4 sm:grid-cols-[minmax(0,2fr)_auto]">
                <div className="flex items-center gap-3 rounded-3xl border border-white/12 bg-white/10 px-5 py-4 shadow-[0_18px_60px_rgba(15,23,42,0.45)]">
                  <input
                    value={name}
                    maxLength={12}
                    onChange={(e) => setName(e.target.value.slice(0, 12))}
                    placeholder="Enter a display name"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onJoin();
                    }}
                    className="flex-1 border-none bg-transparent text-white placeholder:text-white/40 focus:outline-none"
                  />
                </div>
                <button
                  onClick={onJoin}
                  disabled={!name.trim()}
                  className={`w-full rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] transition duration-300 ${
                    name.trim()
                      ? `${primaryButtonGradient} text-white shadow-[0_24px_80px_rgba(56,189,248,0.35)] hover:scale-[1.03] active:scale-[0.98]`
                      : "cursor-not-allowed border border-white/10 bg-white/10 text-white/40"
                  }`}
                >
                  Join table
                </button>
              </div>
            ) : (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="flex flex-col gap-6">
                  <div className="rounded-3xl border border-white/12 bg-white/8 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.45)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.3em] text-white/55">Players</span>
                      <span className="text-sm font-semibold text-white/70">{players.length}</span>
                    </div>
                    <div className="mt-4 flex flex-col gap-3">
                      {players.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-6 text-center text-sm text-white/60">
                          Waiting for players...
                        </div>
                      ) : (
                        players.map((p) => (
                          <div
                            key={p}
                            className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white shadow-[0_18px_60px_rgba(15,23,42,0.4)]"
                          >
                            <span className="font-medium">{p}</span>
                            {p === name && (
                              <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-cyan-100">
                                You
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/12 bg-white/8 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.45)]">
                    <div className="text-xs uppercase tracking-[0.3em] text-white/55">Balance</div>
                    <div className="mt-3 flex items-baseline justify-between gap-3">
                      <span className="text-3xl font-semibold text-white">{walletDisplay}</span>
                      <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white/70">
                        {isHost ? "Host" : "Player"}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-white/60">Balances stay in sync across multiplayer games.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {games.map((g) => (
                      <GameCard
                        key={g.label}
                        label={g.label}
                        blurb={g.blurb}
                        accent={g.accent}
                        selected={selectedGame?.label === g.label}
                        onSelect={() => {
                          if (!isHost) return;
                          setSelectedGame(g);
                          sessionStorage.setItem("gmbl-selected", g.label);
                        }}
                        disabled={!isHost}
                      />
                    ))}
                  </div>

                  <div className="rounded-3xl border border-white/12 bg-white/8 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.45)]">
                    <div className="text-xs uppercase tracking-[0.3em] text-white/55">Table status</div>
                    {isHost ? (
                      <div className="mt-4 flex flex-col gap-4">
                        <p className="text-sm text-white/70">
                          {selectedGame
                            ? `Ready to launch ${selectedGame.label}.`
                            : "Select a game to enable the start button."}
                        </p>
                        <button
                          onClick={startGame}
                          disabled={!canStart}
                          className={`rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] transition duration-300 ${
                            canStart
                              ? `${primaryButtonGradient} text-white shadow-[0_24px_80px_rgba(56,189,248,0.35)] hover:scale-[1.03] active:scale-[0.98]`
                              : "cursor-not-allowed border border-white/10 bg-white/10 text-white/40"
                          }`}
                        >
                          Start game
                        </button>
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-white/70">
                        Waiting for the host to start {selectedGame ? selectedGame.label : "a game"}.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

interface Game {
  label: string;
  path: string;
  blurb: string;
  accent: string;
}

const games: ReadonlyArray<Game> = [
  {
    label: "Blackjack",
    path: "/blackjack",
    blurb: "Hit or stand with friends",
    accent: "from-indigo-500/30 via-sky-400/20 to-cyan-300/25",
  },
  {
    label: "Roulette",
    path: "/roulette",
    blurb: "Spin the wheel together",
    accent: "from-emerald-400/20 via-teal-400/20 to-sky-400/25",
  },
  {
    label: "Baccarat",
    path: "/baccarat",
    blurb: "Choose banker or player",
    accent: "from-sky-400/20 via-indigo-400/20 to-cyan-400/25",
  },
  {
    label: "Hold'em",
    path: "/holdem",
    blurb: "Texas hold'em showdowns",
    accent: "from-teal-400/25 via-sky-400/25 to-indigo-500/25",
  },
];

function GameCard({
  label,
  blurb,
  accent,
  selected,
  onSelect,
  disabled = false,
}: {
  label: string;
  blurb: string;
  accent: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={`group relative flex min-h-[180px] w-full flex-col items-start justify-between overflow-hidden rounded-3xl border border-white/10 bg-slate-950/50 p-6 text-left shadow-[0_24px_90px_rgba(15,23,42,0.4)] backdrop-blur-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
        selected ? "ring-2 ring-cyan-200/70" : ""
      } ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:-translate-y-2 hover:shadow-[0_36px_120px_rgba(56,189,248,0.28)] active:scale-[0.99]"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 rounded-3xl opacity-0 mix-blend-screen transition duration-500 group-hover:opacity-90 ${
          selected ? "opacity-90" : ""
        } bg-gradient-to-br ${accent}`}
      />
      <div className="relative z-10 flex flex-col gap-2">
        <div className="text-xl font-semibold tracking-tight text-white drop-shadow-[0_18px_40px_rgba(56,189,248,0.35)]">
          {label}
        </div>
        <p className="text-sm text-white/65">{blurb}</p>
      </div>
      <div className="relative z-10 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-white/55">
        tap to select
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[0.6rem] text-white/70 transition duration-300 group-hover:translate-x-1 group-hover:bg-white/20">
          →
        </span>
      </div>
      {selected && (
        <span className="pointer-events-none absolute right-5 top-5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-cyan-100">
          selected
        </span>
      )}
    </button>
  );
}

