"use client";

import { useEffect, useRef, useState } from "react";
import { createGameLifecycle } from "@/lib/ai-world/lifecycle";
import type {
  AiWorldHandle,
  AiWorldLiveSnapshot,
  AiWorldOptions,
  DepartmentId,
} from "@/lib/ai-world/types";

type AiWorldStageProps = {
  options?: AiWorldOptions;
  snapshot?: AiWorldLiveSnapshot | null;
  onSelect?: (departmentId: DepartmentId | null) => void;
};

export function AiWorldStage({ options, snapshot = null, onSelect }: AiWorldStageProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<AiWorldHandle | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const optionsKey = JSON.stringify(options ?? null);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const parent = parentRef.current;

    if (!parent) {
      return;
    }

    const lifecycle = createGameLifecycle();
    const observer = new ResizeObserver(() => {
      handleRef.current?.resize();
    });
    observer.observe(parent);

    setReady(false);

    const parsed = optionsKey === "null"
      ? {}
      : JSON.parse(optionsKey) as AiWorldOptions;

    void (async () => {
      const { startAiWorld } = await import("@/lib/ai-world/mount-ai-world");

      if (lifecycle.disposed || !parent.isConnected) {
        return;
      }

      const handle = await startAiWorld(parent, parsed);
      const kept = lifecycle.attach(handle);

      if (!kept) {
        return;
      }

      handleRef.current = handle;
      handle.resize();
      handle.resetCamera();
      setReady(true);
    })();

    return () => {
      observer.disconnect();
      handleRef.current = null;
      lifecycle.dispose();
    };
  }, [optionsKey]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    handleRef.current?.setSelectListener((departmentId) => {
      onSelectRef.current?.(departmentId);
    });
    return () => handleRef.current?.setSelectListener(null);
  }, [ready]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    handleRef.current?.applyState(snapshot);
  }, [ready, snapshot]);

  return (
    <div className="absolute inset-0 z-0">
      <div
        ref={parentRef}
        role="application"
        aria-label="Headquarters map. Scroll to zoom and drag to pan."
        className="h-full w-full touch-none select-none overflow-hidden"
      />
      <button
        type="button"
        onClick={() => handleRef.current?.resetCamera()}
        disabled={!ready}
        className="absolute top-3 right-3 z-10 rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-100 backdrop-blur-md hover:border-zinc-600 disabled:opacity-50"
      >
        Reset camera
      </button>
      <p className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-300">
        Scroll to zoom · Drag to pan
      </p>
    </div>
  );
}
