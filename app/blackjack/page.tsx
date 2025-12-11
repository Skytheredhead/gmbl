"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useRef, useLayoutEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { glassPanelClass, primaryButtonGradient } from "../theme";
import { useWalletBalance } from "../hooks/useSupabaseWallet";

// card helpers
interface Card {
  suit: "♠" | "♥" | "♦" | "♣";
  rank: string;
}
const suits = ["S", "H", "D", "C"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const suitMap: Record<string, Card["suit"]> = { S: "♠", H: "♥", D: "♦", C: "♣" };

// deterministic shuffle so every player shares the same dealer cards
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function createDeck(seed: string): string[] {
  const deck: string[] = [];
  for (const s of suits) {
    for (const r of ranks) deck.push(`${r}${s}`);
  }
  const rand = mulberry32(xmur3(seed)());
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
const parseCard = (c: string): Card => ({ suit: suitMap[c.slice(-1)] || "♠", rank: c.slice(0, c.length - 1) });
function handTotal(hand: Card[]): number {
  let total = 0;
  let aces = 0;
  hand.forEach((c) => {
    if (c.rank === "A") { aces++; total += 11; }
    else if (["J", "Q", "K"].includes(c.rank)) total += 10;
    else total += parseInt(c.rank, 10);
  });
  while (total > 21 && aces) { total -= 10; aces--; }
  return total;
}

function PlayingCard({ card }: { card: Card }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div className="relative h-28 w-20 select-none rounded-2xl border border-white/40 bg-gradient-to-br from-white/95 via-white/90 to-slate-100 font-bold text-slate-900 shadow-[0_18px_60px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-out hover:-translate-y-1 sm:h-32 sm:w-24">
      <span className={`absolute left-2 top-2 text-sm ${isRed ? "text-rose-500" : "text-slate-900"}`}>{card.rank}</span>
      <span className={`absolute right-2 bottom-2 rotate-180 text-sm ${isRed ? "text-rose-500" : "text-slate-900"}`}>{card.rank}</span>
      <span className={`text-4xl sm:text-5xl ${isRed ? "text-rose-500" : "text-slate-900"}`}>{card.suit}</span>
      <span className="pointer-events-none absolute inset-x-2 top-1 h-1 rounded-full bg-white/60 opacity-60 blur-md" />
    </div>
  );
}

function AnimatedCard({ card, facedown }: { card: Card; facedown?: boolean }) {
  const [flip, setFlip] = useState(!facedown);
  useEffect(() => {
    setFlip(!facedown);
  }, [facedown, card]);
  return (
    <motion.div className="card h-28 w-20 sm:h-32 sm:w-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="card-inner h-full w-full" style={{ transform: flip ? "rotateY(0deg)" : "rotateY(180deg)" }}>
        <div className="card-face h-full w-full">
          <PlayingCard card={card} />
        </div>
        <div className="card-face absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" style={{ transform: "rotateY(180deg)" }} />
      </div>
    </motion.div>
  );
}

export default function BlackjackPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [channel, setChannel] = useState<any>(null);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [others, setOthers] = useState<Record<string, Card[]>>({});
  const [players, setPlayers] = useState<string[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, "playing" | "stood" | "bust">>({});
  const [selfStatus, setSelfStatus] = useState<"playing" | "stood" | "bust">("playing");
  const [betsPlaced, setBetsPlaced] = useState<Record<string, number>>({});
  const [pendingBet, setPendingBet] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [playerDeck, setPlayerDeck] = useState<string[]>([]);
  const [dealerDeck, setDealerDeck] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [money, setMoney, moneyState] = useWalletBalance({ mode: "multiplayer", initialBalance: 100 });
  const { loading: moneyLoading } = moneyState;
  const [displayMoney, setDisplayMoney] = useState(money);
  const moneyDisplay = moneyLoading ? "---" : `$${displayMoney.toLocaleString()}`;
  const [betInput, setBetInput] = useState("");
  const [bet, setBet] = useState(0);
  const [phase, setPhase] = useState<"bet" | "player" | "waiting" | "dealer" | "result">(
    "bet"
  );
  const [message, setMessage] = useState("");
  const [canDouble, setCanDouble] = useState(true);
  const [betPrompt, setBetPrompt] = useState(false);
  const [betDelay, setBetDelay] = useState(false);
  const [scale, setScale] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const waiting = Math.max(players.length - Object.keys(betsPlaced).length, 0);

  // compute hand totals without animation
  const dealerTotal = useMemo(
    () =>
      handTotal(
        phase === "player" || phase === "waiting" ? dealer.slice(0, 1) : dealer
      ),
    [dealer, phase]
  );
  const playerTotal = useMemo(() => handTotal(player), [player]);

  useEffect(() => {
    const n = sessionStorage.getItem("gmbl-name") || "";
    const url = new URL(window.location.href);
    const c = url.searchParams.get("code") || "";
    const host = sessionStorage.getItem("gmbl-host") === "1";
    setName(n);
    setCode(c);
    setIsHost(host);
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supaUrl || !supaKey || !n || !c) return;
    const supabase = createClient(supaUrl, supaKey);
    const ch = supabase.channel(`gmbl-blackjack-${c}`, {
      config: { presence: { key: n } },
    });
    ch.on("broadcast", { event: "hand" }, ({ payload }) => {
      const { name: pname, hand } = payload as { name: string; hand: string[] };
      if (pname && pname !== n && Array.isArray(hand)) {
        const parsed = hand.map((h) => parseCard(h));
        setOthers((o) => ({ ...o, [pname]: parsed }));
      }
    });
    ch.on("broadcast", { event: "bet" }, ({ payload }) => {
      const { name: pname, amount } = payload as { name: string; amount: number };
      if (pname && pname !== n) {
        setBetsPlaced((b) => ({ ...b, [pname]: amount }));
      }
    });
    ch.on("broadcast", { event: "state" }, ({ payload }) => {
      const { name: pname, state } = payload as {
        name: string;
        state: "stood" | "bust";
      };
      if (pname && pname !== n) {
        setStatuses((s) => ({ ...s, [pname]: state }));
      }
    });
    ch.on("broadcast", { event: "lobby" }, () => {
    router.push(`/lobby?code=${c}`);
    });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const names = Object.keys(state);
      setPlayers(names);
      setOthers((o) => {
        const updated: Record<string, Card[]> = {};
        names.forEach((p) => {
          if (p !== n && o[p]) updated[p] = o[p];
        });
        return updated;
      });
      setStatuses((s) => {
        const updated: Record<string, "playing" | "stood" | "bust"> = {};
        names.forEach((p) => {
          if (p !== n) updated[p] = s[p] || "playing";
        });
        return updated;
      });
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.track({ username: n });
    });
    setChannel(ch);
    setIsMultiplayer(true);
    return () => {
      ch.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const s = Math.min(w / 1280, h / 720);
      setScale(s > 1 ? Math.min(s, 1.5) : 1);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const othersCount = Object.keys(others).length;

  useLayoutEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.offsetHeight);
    }
  }, [dealer.length, othersCount, phase, player.length, scale]);

  useEffect(() => {
    if (phase === "bet") {
      const t = setTimeout(() => setBetPrompt(true), 5000);
      return () => {
        clearTimeout(t);
        setBetPrompt(false);
      };
    } else {
      setBetPrompt(false);
    }
  }, [phase, betInput]);

  useEffect(() => {
    let frame: number;
    const start = displayMoney;
    const end = money;
    const duration = 500;
    const startTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const progress = Math.min((now - startTime) / duration, 1);
      setDisplayMoney(Math.round(start + (end - start) * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [displayMoney, money]);

  const broadcastHand = useCallback(
    (hand: Card[]) => {
      if (!channel) return;
      const codes = hand.map(
        (c) => `${c.rank}${{ "♠": "S", "♥": "H", "♦": "D", "♣": "C" }[c.suit]}`
      );
      channel.send({ type: "broadcast", event: "hand", payload: { name, hand: codes } });
    },
    [channel, name]
  );

  const deal = useCallback(
    (amt: number) => {
      const nextRound = round + 1;
      setRound(nextRound);
      const seedBase = `${code}-${nextRound}`;
      const pDeck = createDeck(`${seedBase}-${name}`);
      const dDeck = createDeck(`${seedBase}-dealer`);
    const ph = [parseCard(pDeck.shift()!), parseCard(pDeck.shift()!)];
    const dh = [parseCard(dDeck.shift()!), parseCard(dDeck.shift()!)];
    setPlayerDeck(pDeck);
    setDealerDeck(dDeck);
    setPlayer(ph);
    setDealer(dh);
    setBet(amt);
    setPhase("player");
    setCanDouble(true);
    setSelectedQuick(null);
    setSelfStatus("playing");
      setStatuses((s) => {
        const res: Record<string, "playing" | "stood" | "bust"> = {};
        Object.keys(s).forEach((k) => (res[k] = "playing"));
        return res;
      });
      broadcastHand(ph);
    },
    [broadcastHand, code, name, round]
  );

  useEffect(() => {
    if (pendingBet === null) return;

    if (!isMultiplayer) {
      deal(pendingBet);
      setPendingBet(null);
      return;
    }

    const everyoneBet =
      players.length > 0 && players.every((p) => betsPlaced[p] !== undefined);

    if (everyoneBet) {
      deal(pendingBet);
      setPendingBet(null);
    }
  }, [betsPlaced, deal, isMultiplayer, pendingBet, players]);

  const placeBet = () => {
    const amt = parseInt(betInput, 10);
    if (amt > 0 && amt <= money) {
      setMoney(money - amt);
      setBetInput("");
      setBetsPlaced((b) => ({ ...b, [name]: amt }));
      setPendingBet(amt);
      setSelectedQuick(null);
      channel?.send({ type: "broadcast", event: "bet", payload: { name, amount: amt } });
    }
  };

  const quickBet = (amt: number) => {
    if (phase !== "bet" || amt > money) return;
    setMoney(money - amt);
    setBetInput("");
    setBetsPlaced((b) => ({ ...b, [name]: amt }));
    setPendingBet(amt);
    setSelectedQuick(amt);
    channel?.send({ type: "broadcast", event: "bet", payload: { name, amount: amt } });
  };

  const hit = () => {
    if (phase !== "player") return;
    const d = playerDeck.slice();
    const c = parseCard(d.shift()!);
    setPlayerDeck(d);
    const hand = [...player, c];
    setPlayer(hand);
    setCanDouble(false);
    broadcastHand(hand);
    if (handTotal(hand) > 21) {
      setSelfStatus("bust");
      setPhase("waiting");
      setMessage("You bust. Waiting for others...");
      channel?.send({
        type: "broadcast",
        event: "state",
        payload: { name, state: "bust" },
      });
    }
  };

  const stand = () => {
    if (phase !== "player") return;
    setSelfStatus("stood");
    setPhase("waiting");
    setMessage("Waiting for others...");
    channel?.send({
      type: "broadcast",
      event: "state",
      payload: { name, state: "stood" },
    });
  };

  const double = () => {
    if (phase !== "player" || !canDouble || money < bet) return;
    setMoney((m) => m - bet);
    setBet(bet * 2);
    const d = playerDeck.slice();
    const c = parseCard(d.shift()!);
    setPlayerDeck(d);
    const hand = [...player, c];
    setPlayer(hand);
    setCanDouble(false);
    broadcastHand(hand);
    if (handTotal(hand) > 21) {
      setSelfStatus("bust");
      setPhase("waiting");
      setMessage("You bust. Waiting for others...");
      channel?.send({
        type: "broadcast",
        event: "state",
        payload: { name, state: "bust" },
      });
    } else {
      setSelfStatus("stood");
      setPhase("waiting");
      setMessage("Waiting for others...");
      channel?.send({
        type: "broadcast",
        event: "state",
        payload: { name, state: "stood" },
      });
    }
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const resolve = useCallback(
    async (hand: Card[], playerBusted = false) => {
      setPhase("dealer");
      let dhand = dealer.slice();
      let ddeck = dealerDeck.slice();
    await sleep(800); // allow hidden card flip
    while (handTotal(dhand) < 17) {
      dhand.push(parseCard(ddeck.shift()!));
      setDealer([...dhand]);
      await sleep(800);
    }
    setDealerDeck(ddeck);
    const pt = handTotal(hand);
    const dt = handTotal(dhand);
    let msg = "";
    if (playerBusted) {
      msg = "You bust.";
    } else if (dt > 21) {
      msg = "Dealer bust. You win!";
      setMoney((m) => m + bet * 2);
    } else if (pt > dt) {
      msg = "You win!";
      setMoney((m) => m + bet * 2);
    } else if (pt === dt) {
      msg = "Push.";
      setMoney((m) => m + bet);
    } else {
      msg = "Dealer wins.";
    }
    setMessage(msg);
    setPhase("result");
    setBet(0);
    },
    [bet, dealer, dealerDeck, setMoney]
  );

  useEffect(() => {
    if (
      selfStatus !== "playing" &&
      Object.values(statuses).every((s) => s !== "playing")
    ) {
      resolve(player, selfStatus === "bust");
    }
  }, [player, resolve, selfStatus, statuses]);

  const playAgain = () => {
    setBetDelay(true);
    setPhase("bet");
    setBetsPlaced({});
    setPendingBet(null);
    setSelfStatus("playing");
    setStatuses({});
    setOthers({});
    setPlayerDeck([]);
    setDealerDeck([]);
    setTimeout(() => {
      setPlayer([]);
      setDealer([]);
      setMessage("");
      setBet(0);
      setBetDelay(false);
    }, 300);
  };

  const backToLobby = () => {
    channel?.send({ type: "broadcast", event: "lobby" });
    router.push(`/lobby?code=${code}`);
  };

  const leave = () => router.push("/");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex min-h-screen flex-col items-center justify-start overflow-y-auto gap-10 px-4 pb-24 pt-32 text-center sm:px-8"
    >
      <div className="absolute left-6 top-8 flex gap-4 md:left-12 md:top-12">
        <button
          onClick={() => setConfirm(true)}
          className="text-3xl font-black tracking-tight text-white transition hover:text-cyan-200"
        >
            <span className="bg-gradient-to-br from-white via-sky-100 to-cyan-200 bg-clip-text text-transparent">gmbl</span>
        </button>
        {isHost && (
          <button
            onClick={backToLobby}
            className={`${primaryButtonGradient} rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.35)] transition duration-300 hover:scale-[1.03] active:scale-[0.97]`}
          >
            lobby
          </button>
        )}
      </div>
      <div className="absolute right-6 top-8 flex flex-col items-end gap-2 text-right text-white/70 md:right-12 md:top-12">
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
          <span className="text-white">{moneyDisplay}</span>
        </div>
      </div>

      <div
        style={contentHeight ? { height: contentHeight * scale } : undefined}
        className="w-full flex justify-center"
      >
        <div
          ref={contentRef}
          style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
          className="rounded-3xl p-6 flex flex-col items-center gap-8"
        >
        <h2 className="text-3xl font-semibold text-sky-200 drop-shadow-[0_0_18px_rgba(56,189,248,0.35)]">Blackjack</h2>

        <div className="relative w-full min-h-[260px]">
          <AnimatePresence mode="wait">
            {phase === "bet" ? (
              <motion.div
                key="bet"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{
                  delay: betDelay ? 0.05 : 0,
                  duration: 0.45,
                  ease: [0.4, 0, 0.2, 1],
                }}
                className="flex flex-col items-center justify-center gap-2"
            >
              <div className="flex flex-wrap items-center justify-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={money}
                  value={betInput}
                  onChange={(e) => setBetInput(e.target.value)}
                  placeholder="$"
                  className="gmbl-input w-24 text-base"
                />
                <button
                  onClick={placeBet}
                  className={`rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition duration-300 ${
                    /^[1-9]\d*$/.test(betInput) && parseInt(betInput, 10) <= money
                      ? `${primaryButtonGradient} text-white shadow-[0_20px_60px_rgba(56,189,248,0.35)] hover:scale-[1.02] active:scale-[0.98]`
                      : "bg-slate-900/70 text-white/40"
                  }`}
                  disabled={!(parseInt(betInput, 10) > 0 && parseInt(betInput, 10) <= money)}
                >
                  Bet
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {[5, 10, 50].map((v) => (
                  <button
                    key={v}
                    onClick={() => quickBet(v)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] transition duration-300 ${
                      v <= money
                        ? "border-white/12 bg-white/10 text-white/80 hover:border-cyan-200/40 hover:bg-white/15 hover:text-white"
                        : "border-white/5 bg-slate-900/60 text-white/35"
                    } ${selectedQuick === v ? "ring-2 ring-cyan-300/60 bg-white/15 text-white" : ""}`}
                    disabled={v > money}
                  >
                    ${v}
                  </button>
                ))}
              </div>
              <div className="h-5">
                <AnimatePresence>
                  {betPrompt && !betsPlaced[name] ? (
                    <motion.p
                      key="bet-reminder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm text-cyan-200"
                    >
                      Place your bet
                    </motion.p>
                  ) :
                  betsPlaced[name] && waiting > 0 ? (
                    <motion.p
                      key="waiting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm text-white/60"
                    >
                      waiting for players ({waiting})
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
            ) : (
            <motion.div
              key="game"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
              className="flex flex-col items-center gap-4"
            >
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-semibold text-sky-200">Dealer ({dealerTotal})</span>
                <div className="flex gap-2">
                  {dealer.map((c, i) => (
                    <AnimatedCard
                      key={i}
                      card={c}
                      facedown={i === 1 && (phase === "player" || phase === "waiting")}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="flex gap-2">
                  {player.map((c, i) => (
                    <AnimatedCard key={i} card={c} />
                  ))}
                </div>
                <span className="text-sm font-semibold text-sky-200">You ({playerTotal})</span>
              </div>

              {phase === "player" && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={hit}
                    className={`${primaryButtonGradient} rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.3)] transition duration-300 hover:scale-[1.02] active:scale-[0.97]`}
                  >
                    Hit
                  </button>
                  <button
                    onClick={stand}
                    className="rounded-full border border-cyan-300/40 bg-slate-900/70 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/70 transition duration-300 hover:bg-slate-800/80 hover:text-white"
                  >
                    Stand
                  </button>
                  {canDouble && money >= bet && (
                    <button
                      onClick={double}
                      className={`${primaryButtonGradient} rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.3)] transition duration-300 hover:scale-[1.02] active:scale-[0.97]`}
                    >
                      Double
                    </button>
                  )}
                </div>
              )}

              {phase === "waiting" && (
                <p className="mt-2 text-lg font-semibold">{message}</p>
              )}

              {phase === "result" && (
                <div className="mt-2 flex flex-col items-center gap-3">
                  <p className="text-xl font-semibold">{message}</p>
                  {money > 0 ? (
                    <button
                      onClick={playAgain}
                      className={`${primaryButtonGradient} rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.3)] transition duration-300 hover:scale-[1.02] active:scale-[0.97]`}
                    >
                      Play Again
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setMoney(100);
                        playAgain();
                      }}
                      className={`${primaryButtonGradient} rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.3)] transition duration-300 hover:scale-[1.02] active:scale-[0.97]`}
                    >
                      Reload Account
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </div>

      {phase !== "bet" && Object.keys(others).length > 0 && (
        <div className="mt-6 w-full max-w-md">
          <div className={`${glassPanelClass} p-5 shadow-[0_30px_120px_rgba(15,23,42,0.45)]`}>
            {Object.entries(others).map(([p, hand], idx) => {
              const total = handTotal(hand);
              const bust = total > 21;
              return (
                <div
                  key={p}
                  className={`${idx !== 0 ? "mt-4 border-t border-white/10 pt-4" : ""}`}
                >
                  <div className="mb-2 text-sm font-semibold">
                    {p} ({total}){bust ? " - Bust" : ""}
                  </div>
                  <div className="flex gap-2">
                    {hand.map((c, i) => (
                      <PlayingCard key={i} card={c} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AnimatePresence>
        {confirm && (
          <motion.div
            key="overlay"
            className="gmbl-overlay"
            initial={{ backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)", backgroundColor: "rgba(0,0,0,0)", opacity: 0 }}
            animate={{ backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", backgroundColor: "rgba(0,0,0,0.35)", opacity: 1 }}
            exit={{ backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)", backgroundColor: "rgba(0,0,0,0)", opacity: 0, transition: { duration: 0.27, ease: [0.4, 0, 0.2, 1] } }}
            transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.27, ease: [0.4, 0, 0.2, 1] } }}
              transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
              className="gmbl-card rounded-2xl p-6 text-center"
            >
              <p className="mb-4 text-lg text-sky-100">Are you sure you want to leave?</p>
              <div className="flex justify-center gap-6">
                <button
                  onClick={leave}
                  className={`${primaryButtonGradient} rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.3)] transition duration-300 hover:scale-[1.02] active:scale-[0.97]`}
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirm(false)}
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white/70 transition duration-300 hover:bg-white/20 hover:text-white"
                >
                  No
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
