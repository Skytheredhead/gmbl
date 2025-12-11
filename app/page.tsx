"use client";

import React, { useEffect, useRef, useState } from "react";

import { glassPanelClass, primaryButtonGradient } from "./theme";

// Canvas-safe, dependency-free home screen for gmbl
// - No next/router or framer-motion
// - Keeps: title, segmented join code, multiplayer toggle, 3 game cards
// - Adds: data-testid hooks for easy testing

export default function GmblHome() {
  const [code, setCode] = useState(""); // 4‑digit room code
  const [showHoldemModal, setShowHoldemModal] = useState(false);
  const firstHoldemOptionRef = useRef<HTMLButtonElement>(null);

  const canJoin = code.length === 4;

  const navigate = (path: string) => {
    if (typeof window !== "undefined") {
      window.location.href = path;
    }
  };

  useEffect(() => {
    if (!showHoldemModal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowHoldemModal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHoldemModal]);

  useEffect(() => {
    if (showHoldemModal) {
      const id = window.setTimeout(() => {
        firstHoldemOptionRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [showHoldemModal]);

  const onJoin = () => {
    if (!canJoin) return;
    // join existing lobby by code
    navigate(`/lobby?code=${code}`);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") onJoin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, onJoin]);

  return (
    <main className="relative min-h-screen overflow-hidden px-3 pb-24 text-white sm:px-6">
      {/* Foreground vignette so elements pop on any bg */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_680px_at_50%_-10%,rgba(255,255,255,0.08),transparent),radial-gradient(900px_580px_at_10%_85%,rgba(45,212,191,0.14),transparent),radial-gradient(900px_580px_at_90%_88%,rgba(129,140,248,0.15),transparent)]" />

      <section className="relative z-10 mx-auto w-full max-w-6xl px-2 pt-24 sm:px-6 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-x-12">
          <header className="lg:col-span-12">
            <div className="text-center">
              <h1 className="select-none text-[2.9rem] font-black leading-tight tracking-tight text-white drop-shadow-[0_0_24px_rgba(148,163,184,0.4)] sm:text-[3.2rem] lg:text-[3.4rem]">
                <span className="bg-gradient-to-br from-white via-sky-100 to-cyan-200 bg-clip-text text-transparent">gmbl</span>
              </h1>
            </div>
          </header>

          <div className="lg:col-span-12">
            <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 xl:grid-cols-3">
              <JoinCard
                code={code}
                onCodeChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 4))}
                onJoin={onJoin}
                canJoin={canJoin}
              />
              {games.map((g) => {
                const handleClick = () => {
                  if (g.disabled) return;
                  if (g.action === "holdem") {
                    setShowHoldemModal(true);
                    return;
                  }
                  if (g.path) navigate(g.path);
                };
                return <GameCard key={g.label} {...g} onClick={handleClick} />;
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-center text-xs text-white/60">
        <span className="pointer-events-auto text-white/60">not a real gambling site, just for fun</span>
      </div>

      {showHoldemModal && (
        <HoldemModal
          onClose={() => setShowHoldemModal(false)}
          onSelect={(count) => {
            setShowHoldemModal(false);
            navigate(`/holdem?bots=${count}`);
          }}
          firstOptionRef={firstHoldemOptionRef}
        />
      )}
    </main>
  );
}

type GameCardConfig = {
  label: string;
  path?: string;
  subtext?: string;
  className?: string;
  action?: "holdem";
  disabled?: boolean;
};

function JoinCard({
  code,
  onCodeChange,
  onJoin,
  canJoin,
}: {
  code: string;
  onCodeChange: (value: string) => void;
  onJoin: () => void;
  canJoin: boolean;
}) {
  return (
    <div
      className={`${glassPanelClass} group relative flex h-full min-h-[320px] min-w-[18rem] flex-col overflow-hidden rounded-[30px] border border-white/12 bg-white/8 p-9 text-left shadow-[0_26px_110px_rgba(15,23,42,0.48)] backdrop-blur-2xl transition-all duration-300 ease-out hover:-translate-y-2 hover:shadow-[0_42px_160px_rgba(56,189,248,0.3)] sm:p-10`}
      data-testid="join-card"
    >
      <div className="pointer-events-none absolute inset-0 rounded-[30px] opacity-0 mix-blend-screen transition-opacity duration-500 group-hover:opacity-100 bg-gradient-to-br from-cyan-400/25 via-emerald-400/20 to-sky-500/25" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent)] opacity-50 transition-opacity duration-500 group-hover:opacity-80" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-white/65">
          Enter
          <span className="block h-[1px] flex-1 rounded-full bg-white/20" />
        </div>
        <h2 className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-white drop-shadow-[0_12px_32px_rgba(56,189,248,0.25)]">
          Enter lobby code
        </h2>

        <form
          className="mt-10 flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            onJoin();
          }}
        >
          <div className="flex w-full flex-wrap items-center gap-3 rounded-[26px] border border-white/12 bg-slate-950/70 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] focus-within:ring-2 focus-within:ring-cyan-300/70">
            <input
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="0000"
              aria-label="Lobby code"
              className="min-w-[150px] flex-1 rounded-[18px] bg-slate-950/40 px-4 py-3 text-center text-3xl font-semibold tracking-[0.24em] text-white placeholder:text-white/35 focus:outline-none"
              data-testid="code-input"
            />
            <button
              type="submit"
              disabled={!canJoin}
              className={`flex h-14 min-w-[132px] items-center justify-center rounded-[18px] px-6 text-base font-semibold uppercase tracking-[0.24em] transition-all ${
                canJoin
                  ? `${primaryButtonGradient} text-white shadow-[0_24px_90px_rgba(56,189,248,0.35)] hover:-translate-y-[1px] hover:shadow-[0_34px_120px_rgba(59,130,246,0.45)] active:translate-y-[1px]`
                  : "cursor-not-allowed bg-white/8 text-white/35"
              }`}
              data-testid="join-button"
            >
              Join
            </button>
          </div>
        </form>
      </div>

      <div className="pointer-events-none absolute inset-x-6 top-6 h-1 rounded-full bg-white/45 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-80" />
    </div>
  );
}

const games: ReadonlyArray<GameCardConfig> = [
  {
    label: "Multiplayer",
    path: "/lobby",
    subtext: "Create a room and invite friends",
    className: "bg-gradient-to-br from-cyan-400/25 via-emerald-400/20 to-sky-500/25",
  },
  {
    label: "Blackjack",
    path: "/blackjack",
    subtext: "Hit, stand, and stack your chips",
    className: "bg-gradient-to-br from-indigo-400/25 via-sky-400/20 to-cyan-400/25",
  },
  {
    label: "Roulette",
    path: "/roulette",
    subtext: "Bet big and watch the wheel",
    className: "bg-gradient-to-br from-emerald-400/25 via-teal-400/20 to-sky-400/25",
  },
  {
    label: "Baccarat",
    path: "/baccarat",
    subtext: "Player or banker? Choose your side",
    className: "bg-gradient-to-br from-sky-400/25 via-indigo-400/20 to-cyan-400/22",
  },
  {
    label: "Hold'em",
    subtext: "Play against poker bots",
    className: "bg-gradient-to-br from-teal-400/30 via-sky-400/24 to-indigo-500/30",
    action: "holdem",
  },
];

function GameCard({
  label,
  onClick,
  subtext,
  className,
  disabled,
}: {
  label: string;
  onClick: () => void;
  subtext?: string;
  className?: string;
  disabled?: boolean;
}) {
  const showSub = subtext === undefined ? "Click to play" : subtext;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex h-full min-h-[320px] min-w-[18rem] flex-col overflow-hidden rounded-[30px] border border-white/12 bg-white/8 p-9 text-left shadow-[0_26px_110px_rgba(15,23,42,0.48)] backdrop-blur-2xl transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:p-10 ${
        disabled
          ? "cursor-default opacity-60"
          : "hover:-translate-y-2 hover:shadow-[0_42px_160px_rgba(56,189,248,0.3)] active:translate-y-[1px]"
      } ${className || ""}`}
      data-testid={`card-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
      aria-label={`${label} card`}
    >
      <div className={`pointer-events-none absolute inset-0 rounded-[30px] opacity-0 mix-blend-screen transition-opacity duration-500 group-hover:opacity-100 ${className ?? ""}`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent)] opacity-50 transition-opacity duration-500 group-hover:opacity-80" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-white/65">
          Game
          <span className="block h-[1px] flex-1 rounded-full bg-white/20" />
        </div>
        <div className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight text-white drop-shadow-[0_12px_32px_rgba(56,189,248,0.25)]">
          {label}
        </div>
        {showSub && <div className="mt-3 max-w-[19rem] text-[0.95rem] leading-relaxed text-white/75 sm:text-base">{showSub}</div>}

        <div className="mt-auto pt-8">
          <span
            className={`inline-flex h-12 w-full items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-sm font-semibold uppercase tracking-[0.28em] text-white transition-all duration-300 ${
              disabled
                ? "opacity-70"
                : "hover:border-white/30 hover:bg-white/18 hover:text-white"
            }`}
          >
            {disabled ? "Stay tuned" : "Enter table"}
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-6 top-6 h-1 rounded-full bg-white/45 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-80" />
    </button>
  );
}

function HoldemModal({
  onClose,
  onSelect,
  firstOptionRef,
}: {
  onClose: () => void;
  onSelect: (count: number) => void;
  firstOptionRef: React.RefObject<HTMLButtonElement>;
}) {
  const counts = [1, 2, 3];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="holdem-modal-title"
        className={`${glassPanelClass} relative w-full max-w-md px-8 py-10 shadow-[0_40px_160px_rgba(56,189,248,0.35)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/60 transition hover:bg-white/20 hover:text-white"
          aria-label="Close Hold&apos;em setup"
        >
          ×
        </button>
        <div className="flex flex-col gap-6 text-center text-white">
          <div>
            <h2 id="holdem-modal-title" className="text-2xl font-semibold tracking-tight text-white">
              How many bots?
            </h2>
              <p className="mt-2 text-sm text-white/70">
                Choose your table size to launch Texas Hold&apos;em.
              </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {counts.map((count, idx) => (
              <button
                key={count}
                ref={idx === 0 ? firstOptionRef : undefined}
                onClick={() => onSelect(count)}
                className={`group relative overflow-hidden rounded-2xl border border-white/10 ${primaryButtonGradient} px-6 py-5 text-lg font-semibold uppercase tracking-[0.2em] text-white shadow-[0_24px_80px_rgba(56,189,248,0.35)] transition duration-300 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.97]`}
              >
                <span className="relative z-10">{count}</span>
                <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100" style={{ boxShadow: "0 0 80px 18px rgba(56,189,248,0.4) inset" }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

