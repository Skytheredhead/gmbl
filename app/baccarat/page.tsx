"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { glassPanelClass, primaryButtonGradient } from "../theme";
import { useWalletBalance } from "../hooks/useSupabaseWallet";

// card helpers (shared with blackjack)
interface Card {
  suit: "♠" | "♥" | "♦" | "♣";
  rank: string;
}

const suits = ["S", "H", "D", "C"];
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const suitMap: Record<string, Card["suit"]> = { S: "♠", H: "♥", D: "♦", C: "♣" };

function createDeck(): string[] {
  const deck: string[] = [];
  for (const s of suits) {
    for (const r of ranks) deck.push(`${r}${s}`);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const parseCard = (c: string): Card => ({
  suit: suitMap[c.slice(-1)] || "♠",
  rank: c.slice(0, c.length - 1),
});

function cardValue(card: Card): number {
  if (card.rank === "A") return 1;
  if (["10", "J", "Q", "K"].includes(card.rank)) return 0;
  return parseInt(card.rank, 10);
}

function handTotal(hand: Card[]): number {
  return hand.reduce((t, c) => (t + cardValue(c)) % 10, 0);
}

function PlayingCard({ card }: { card: Card }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  return (
    <div className="relative h-28 w-20 select-none rounded-2xl border border-white/40 bg-gradient-to-br from-white/95 via-white/90 to-slate-100 font-bold shadow-[0_18px_60px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-out hover:-translate-y-1 sm:h-32 sm:w-24">
      <span className={`absolute left-2 top-2 text-sm ${isRed ? "text-rose-500" : "text-slate-900"}`}>{card.rank}</span>
      <span className={`absolute right-2 bottom-2 rotate-180 text-sm ${isRed ? "text-rose-500" : "text-slate-900"}`}>{card.rank}</span>
      <span className={`text-4xl sm:text-5xl ${isRed ? "text-rose-500" : "text-slate-900"}`}>{card.suit}</span>
      <span className="pointer-events-none absolute inset-x-2 top-1 h-1 rounded-full bg-white/60 opacity-60 blur-md" />
    </div>
  );
}

function AnimatedCard({ card }: { card: Card }) {
  return (
    <motion.div className="h-28 w-20 sm:h-32 sm:w-24" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <PlayingCard card={card} />
    </motion.div>
  );
}

export default function BaccaratPage() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deck, setDeck] = useState<string[]>([]);
  const [player, setPlayer] = useState<Card[]>([]);
  const [banker, setBanker] = useState<Card[]>([]);
  const [wallet, setWallet, walletState] = useWalletBalance({ mode: "multiplayer", initialBalance: 100 });
  const { loading: walletLoading } = walletState;
  const [displayWallet, setDisplayWallet] = useState(wallet);
  const walletDisplay = walletLoading ? "---" : `$${displayWallet.toLocaleString()}`;
  const [betInput, setBetInput] = useState("");
  const [betType, setBetType] = useState<"player" | "banker" | "tie" | null>(null);
  const [bet, setBet] = useState(0);
  const [phase, setPhase] = useState<"bet" | "result">("bet");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDeck(createDeck());
  }, []);

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
  }, [wallet]);

  const leave = () => router.push("/");

  const deal = () => {
    const wager = parseInt(betInput, 10);
    if (!wager || wager > wallet || !betType) return;
    if (deck.length < 10) setDeck(createDeck());
    const d = [...deck];
    const draw = () => parseCard(d.pop()!);
    const p: Card[] = [draw(), draw()];
    const b: Card[] = [draw(), draw()];
    let pTotal = handTotal(p);
    let bTotal = handTotal(b);
    let playerThird: Card | null = null;

    if (pTotal < 8 && bTotal < 8) {
      if (pTotal <= 5) {
        playerThird = draw();
        p.push(playerThird);
        pTotal = handTotal(p);
      }
      if (playerThird) {
        const pt = cardValue(playerThird);
        if (bTotal <= 2) b.push(draw());
        else if (bTotal === 3 && pt !== 8) b.push(draw());
        else if (bTotal === 4 && pt >= 2 && pt <= 7) b.push(draw());
        else if (bTotal === 5 && pt >= 4 && pt <= 7) b.push(draw());
        else if (bTotal === 6 && (pt === 6 || pt === 7)) b.push(draw());
      } else {
        if (bTotal <= 5) b.push(draw());
      }
      bTotal = handTotal(b);
    }

    setDeck(d);
    setPlayer(p);
    setBanker(b);
    setBet(wager);
    setWallet((w) => w - wager);

    let result: "player" | "banker" | "tie";
    if (pTotal > bTotal) result = "player";
    else if (bTotal > pTotal) result = "banker";
    else result = "tie";

    if (result === "player") {
      if (betType === "player") setWallet((w) => w + wager * 2);
      setMessage("Player wins!");
    } else if (result === "banker") {
      if (betType === "banker") setWallet((w) => w + Math.round(wager * 1.95));
      setMessage("Banker wins!");
    } else {
      if (betType === "tie") setWallet((w) => w + wager * 9);
      else setWallet((w) => w + wager); // push
      setMessage("Tie!");
    }

    setPhase("result");
  };

  const playAgain = () => {
    setPlayer([]);
    setBanker([]);
    setBet(0);
    setBetInput("");
    setBetType(null);
    setMessage("");
    setPhase("bet");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative flex min-h-screen flex-col items-center justify-center gap-10 px-4 pb-24 pt-32 text-center sm:px-8"
    >
      <button
        onClick={() => setConfirm(true)}
        className="absolute left-6 top-8 text-3xl font-black tracking-tight text-white transition hover:text-cyan-200 md:left-12 md:top-12"
      >
        <span className="bg-gradient-to-br from-white via-sky-100 to-cyan-200 bg-clip-text text-transparent">gmbl</span>
      </button>
      <h2 className="text-3xl font-semibold text-sky-200 drop-shadow-[0_0_18px_rgba(56,189,248,0.35)]">Baccarat</h2>
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
          <span className="text-white">{walletDisplay}</span>
        </div>
      </div>

      {phase === "bet" && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={wallet}
              value={betInput}
              onChange={(e) => setBetInput(e.target.value)}
              placeholder="$"
              className="gmbl-input w-24 text-base"
            />
            <button
              onClick={deal}
              className={`rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] transition duration-300 ${
                /^[1-9]\d*$/.test(betInput) && parseInt(betInput, 10) <= wallet && betType
                  ? `${primaryButtonGradient} text-white shadow-[0_20px_60px_rgba(56,189,248,0.3)] hover:scale-[1.02] active:scale-[0.97]`
                  : "bg-slate-900/70 text-white/40"
              }`}
            >
              Deal
            </button>
          </div>
          <div className="flex gap-4">
            {([
              ["player", "Player"],
              ["banker", "Banker"],
              ["tie", "Tie"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setBetType(key)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] transition duration-300 ${
                  betType === key
                    ? `${primaryButtonGradient} text-white shadow-[0_18px_48px_rgba(56,189,248,0.3)]`
                    : "border-cyan-300/40 bg-slate-900/70 text-white/70 hover:bg-slate-800/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-sky-200">Player ({handTotal(player)})</span>
            <div className="flex gap-2">
              {player.map((c, i) => (
                <AnimatedCard key={i} card={c} />
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex gap-2">
              {banker.map((c, i) => (
                <AnimatedCard key={i} card={c} />
              ))}
            </div>
        <span className="text-sm font-semibold text-sky-200">Banker ({handTotal(banker)})</span>
          </div>
          <p className="text-xl font-semibold">{message}</p>
          {wallet > 0 ? (
            <button
              onClick={playAgain}
              className={`${primaryButtonGradient} rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.3)] transition duration-300 hover:scale-[1.02] active:scale-[0.97]`}
            >
              Play Again
            </button>
          ) : (
            <button
              onClick={() => {
                setWallet(100);
                playAgain();
              }}
              className={`${primaryButtonGradient} rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.3)] transition duration-300 hover:scale-[1.02] active:scale-[0.97]`}
            >
              Reload Account
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {confirm && (
          <motion.div
            key="overlay"
            className="gmbl-overlay"
            initial={{ backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)", backgroundColor: "rgba(0,0,0,0)", opacity: 0 }}
            animate={{ backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", backgroundColor: "rgba(0,0,0,0.35)", opacity: 1 }}
            exit={{ backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)", backgroundColor: "rgba(0,0,0,0)", opacity: 0, transition: { duration: 0.18 } }}
            transition={{ duration: 0.28 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.18 } }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
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

