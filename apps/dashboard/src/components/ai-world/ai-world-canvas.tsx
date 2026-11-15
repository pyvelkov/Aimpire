"use client";

import dynamic from "next/dynamic";

function WorldLoading() {
  return (
    <div className="grid h-[min(72vh,680px)] min-h-[420px] place-items-center rounded-xl border border-zinc-800/80 bg-[#1a2420] text-zinc-300">
      <p className="text-sm text-zinc-300">Opening headquarters…</p>
    </div>
  );
}

const AiWorldLive = dynamic(
  () => import("./ai-world-live").then((mod) => mod.AiWorldLive),
  { ssr: false, loading: () => <WorldLoading /> },
);

export function AiWorldCanvas() {
  return (
    <div className="min-h-[420px]">
      <AiWorldLive />
    </div>
  );
}
