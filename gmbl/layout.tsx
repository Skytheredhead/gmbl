"use client";

import React from "react";
import { gradientBackground } from "./theme";

export default function GmblLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-screen overflow-x-hidden bg-slate-950 text-white">
      <div className={`pointer-events-none absolute inset-0 ${gradientBackground} opacity-95`} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(2,6,23,0.2),rgba(2,6,23,0.88))]" />
      <div className="pointer-events-none absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl mix-blend-screen animate-[spin_32s_linear_infinite]" />
      <div className="pointer-events-none absolute -right-32 top-10 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl mix-blend-screen animate-[spin_40s_linear_infinite_reverse]" />
      <div className="pointer-events-none absolute left-1/2 bottom-0 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-indigo-500/25 blur-[160px] opacity-80" />
      <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
    </div>
  );
}
