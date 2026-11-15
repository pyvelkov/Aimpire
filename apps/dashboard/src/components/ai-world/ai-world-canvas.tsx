"use client";

import dynamic from "next/dynamic";

function WorldLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <p className="text-sm text-[#d9d3c7]">Opening headquarters…</p>
    </div>
  );
}

const AiWorldStage = dynamic(
  () => import("./ai-world-stage").then((mod) => mod.AiWorldStage),
  { ssr: false, loading: () => <WorldLoading /> },
);

export function AiWorldCanvas() {
  return (
    <div className="relative h-[min(72vh,680px)] min-h-[420px] overflow-hidden rounded-2xl bg-[#1a2420] shadow-sm ring-1 ring-line">
      <AiWorldStage />
    </div>
  );
}
