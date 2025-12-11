"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import RouletteGame, { RouletteGameHandle } from "./RouletteGame";
import { glassPanelClass, primaryButtonGradient } from "../theme";
import { useWalletBalance } from "../hooks/useSupabaseWallet";

export default function RoulettePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"singleplayer" | "multiplayer">("singleplayer");
  const isMultiplayer = mode === "multiplayer";
  const [wallet, setWallet, walletState] = useWalletBalance({ mode, initialBalance: 100 });
  const { loading: walletLoading } = walletState;
  const [displayWallet, setDisplayWallet] = useState(wallet);
  const walletDisplay = walletLoading ? "---" : `$${displayWallet.toLocaleString()}`;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [channel, setChannel] = useState<any>(null);
  const [others, setOthers] = useState<Record<string, { bets: any; sideBets: any }>>({});
  const [players, setPlayers] = useState<string[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [betsPlaced, setBetsPlaced] = useState<Record<string, boolean>>({});
  const gameRef = useRef<RouletteGameHandle>(null);

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

  useEffect(() => {
    const n = sessionStorage.getItem("gmbl-name") || "";
    const url = new URL(window.location.href);
    const c = url.searchParams.get("code") || "";
    const host = sessionStorage.getItem("gmbl-host") === "1";
    setName(n);
    setCode(c);
    if (c) {
      setMode("multiplayer");
      setIsHost(host);
    } else {
      setMode("singleplayer");
      setIsHost(true);
    }
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supaUrl || !supaKey || !n || !c) return;
    const supabase = createClient(supaUrl, supaKey);
    const ch = supabase.channel(`gmbl-roulette-${c}`, {
      config: { presence: { key: n } },
    });
    ch.on("broadcast", { event: "bets" }, ({ payload }) => {
      const { name: pname, data } = payload as any;
      if (pname && pname !== n) {
        setOthers((o) => ({ ...o, [pname]: data }));
        const betsData = ((data as any).bets || {}) as Record<string, number>;
        const sideData = ((data as any).sideBets || {}) as Record<string, number>;
        const total =
          Object.values(betsData).reduce((a, b) => a + b, 0) +
          Object.values(sideData).reduce((a, b) => a + b, 0);
        setBetsPlaced((b) => ({ ...b, [pname]: total > 0 }));
      }
    });
    ch.on("broadcast", { event: "spin" }, () => {
      gameRef.current?.spin();
      setBetsPlaced({});
    });
    ch.on("broadcast", { event: "lobby" }, () => {
      router.push(`/lobby?code=${c}`);
    });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const names = Object.keys(state);
      setPlayers(names);
      setOthers((o) => {
        const updated: Record<string, { bets: any; sideBets: any }> = {};
        names.forEach((p) => {
          if (p !== n && o[p]) updated[p] = o[p];
        });
        return updated;
      });
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.track({ username: n });
    });
    setChannel(ch);
    return () => {
      ch.unsubscribe();
    };
  }, []);

  const broadcastBets = (data: { bets: any; sideBets: any }) => {
    if (!channel) return;
    channel.send({ type: "broadcast", event: "bets", payload: { name, data } });
    const betsData = ((data as any).bets || {}) as Record<string, number>;
    const sideData = ((data as any).sideBets || {}) as Record<string, number>;
    const total =
      Object.values(betsData).reduce((a, b) => a + b, 0) +
      Object.values(sideData).reduce((a, b) => a + b, 0);
    setBetsPlaced((b) => ({ ...b, [name]: total > 0 }));
  };

  const backToLobby = () => {
    if (!isMultiplayer) return;
    channel?.send({ type: "broadcast", event: "lobby" });
    router.push(`/lobby?code=${code}`);
  };

  const leave = () => router.push("/");

  const allBet = isMultiplayer ? players.length > 0 && players.every((p) => betsPlaced[p]) : true;
  const waiting = isMultiplayer ? players.filter((p) => !betsPlaced[p]).length : 0;

  const startSpin = () => {
    if (isMultiplayer) {
      if (!isHost || !allBet) return;
      channel?.send({ type: "broadcast", event: "spin", payload: {} });
      gameRef.current?.spin();
      setBetsPlaced({});
      return;
    }
    gameRef.current?.spin();
    setBetsPlaced({});
  };

  const renderPrimaryAction = (variant: "desktop" | "mobile"): JSX.Element => {
    const baseButton =
      variant === "desktop"
        ? `flex h-full w-full items-center justify-center rounded-2xl border-2 border-white/12 ${primaryButtonGradient} text-2xl font-black uppercase tracking-[0.35em] text-white shadow-[0_18px_60px_rgba(56,189,248,0.35)] transition-all duration-300 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-cyan-200/50 active:scale-[0.99]`
        : `flex w-full items-center justify-center rounded-2xl border-2 border-white/12 ${primaryButtonGradient} py-4 text-lg font-bold uppercase tracking-[0.25em] text-white shadow-[0_18px_60px_rgba(56,189,248,0.3)] transition-all duration-300 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-cyan-200/50 active:scale-[0.99]`;
    const disabledClasses = "cursor-not-allowed opacity-40";

    if (isMultiplayer) {
      if (isHost) {
        const canSpin = allBet;
        return (
          <button
            onClick={startSpin}
            disabled={!canSpin}
            className={`${baseButton} ${variant === "desktop" ? "min-h-[88px]" : ""} ${canSpin ? "" : disabledClasses}`}
          >
            start spin
          </button>
        );
      }

      const waitingStyles =
        variant === "desktop"
          ? "flex h-full w-full items-center justify-center rounded-2xl border-2 border-white/15 bg-white/10 text-lg font-semibold uppercase tracking-[0.25em] text-white/80 backdrop-blur transition duration-300"
          : "flex w-full items-center justify-center rounded-2xl border-2 border-white/15 bg-white/10 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white/75 backdrop-blur transition duration-300";

      return <div className={waitingStyles}>waiting for host</div>;
    }

    return (
      <button
        onClick={startSpin}
        className={`${baseButton} ${variant === "desktop" ? "min-h-[88px]" : ""}`}
      >
        spin
      </button>
    );
  };

  const desktopControls = (
    <div className="flex h-full w-full flex-col justify-end">
      <div className="flex-1">{renderPrimaryAction("desktop")}</div>
      {isMultiplayer && (
        <div className="mt-3 text-sm font-medium uppercase tracking-[0.18em] text-white/70">
          waiting for players ({waiting})
        </div>
      )}
    </div>
  );

  const mobileControls = (
    <div className="flex w-full flex-col items-center gap-3">
      {renderPrimaryAction("mobile")}
      {isMultiplayer && (
        <div className="text-sm uppercase tracking-[0.2em] text-white/65">
          waiting for players ({waiting})
        </div>
      )}
    </div>
  );

  const showLobbyButton = isMultiplayer && isHost;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="relative flex min-h-screen flex-col items-center justify-start overflow-y-auto gap-10 px-4 pb-24 pt-32 text-center sm:px-8"
    >
      <div className="absolute left-6 top-8 flex gap-4 md:left-12 md:top-12">
        <button
          onClick={leave}
          className="text-3xl font-black tracking-tight text-white transition hover:text-cyan-200"
        >
          <span className="bg-gradient-to-br from-white via-sky-100 to-cyan-200 bg-clip-text text-transparent">gmbl</span>
        </button>
        {showLobbyButton && (
          <button
            onClick={backToLobby}
            className={`${primaryButtonGradient} rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-[0_20px_60px_rgba(56,189,248,0.35)] transition duration-300 hover:scale-[1.03] active:scale-[0.97]`}
          >
            lobby
          </button>
        )}
      </div>
      <h2 className="text-3xl font-semibold text-sky-200 drop-shadow-[0_0_18px_rgba(56,189,248,0.35)]">Roulette</h2>
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
      <RouletteGame
        ref={gameRef}
        wallet={wallet}
        setWallet={setWallet}
        onStateChange={broadcastBets}
        controlsDesktop={desktopControls}
        controlsMobile={mobileControls}
      />

      {isMultiplayer && Object.keys(others).length > 0 && (
        <div className="mt-6 w-full max-w-md">
          <div className={`${glassPanelClass} p-5 shadow-[0_30px_120px_rgba(15,23,42,0.45)]`}>
            {Object.entries(others).map(([p, data], idx) => (
              <div key={p} className={`${idx !== 0 ? "mt-4 border-t border-white/10 pt-4" : ""}`}>
                <div className="mb-2 text-sm font-semibold">{p}</div>
                <div className="space-y-1 text-left text-xs">
                  {Object.entries(data.bets || {}).map(([n, amt]) => (
                    <div key={n}>{n}: ${amt as any}</div>
                  ))}
                  {Object.entries(data.sideBets || {}).map(([s, amt]) =>
                    (amt as any) > 0 ? (
                      <div key={s}>{s}: ${amt as any}</div>
                    ) : null
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
