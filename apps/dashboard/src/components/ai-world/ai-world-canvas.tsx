"use client";

import dynamic from "next/dynamic";

function WorldLoading() {
  return (
    <div className="grid h-[min(72vh,680px)] min-h-[420px] place-items-center rounded-2xl bg-[#1a2420] ring-1 ring-line">
      <p className="text-sm text-[#d9d3c7]">Opening headquarters…</p>
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
