import {
  readClientSnapshot,
  type AiWorldPollEvent,
  type AiWorldSnapshot,
} from "./snapshot";

export const AI_WORLD_POLL_INTERVAL_MS = 10_000;

export type AiWorldPoller = {
  start: () => void;
  stop: () => void;
};

export function createAiWorldPoller(options: {
  load: () => Promise<AiWorldSnapshot>;
  onUpdate: (event: AiWorldPollEvent) => void;
  intervalMs?: number;
  isHidden?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  subscribeVisibility?: (onChange: () => void) => () => void;
}): AiWorldPoller {
  const intervalMs = options.intervalMs ?? AI_WORLD_POLL_INTERVAL_MS;
  const isHidden = options.isHidden ?? (() => false);
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const subscribeVisibility = options.subscribeVisibility ?? ((onChange) => {
    if (typeof document === "undefined") {
      return () => {};
    }
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  });

  let stopped = true;
  let timer: unknown = null;
  let unsubscribe = () => {};

  const clear = () => {
    if (timer == null) {
      return;
    }
    clearTimer(timer);
    timer = null;
  };

  const schedule = () => {
    clear();
    if (stopped || isHidden()) {
      return;
    }
    timer = setTimer(() => {
      void tick();
    }, intervalMs);
  };

  const tick = async () => {
    if (stopped || isHidden()) {
      return;
    }
    try {
      const snapshot = await options.load();
      if (stopped) {
        return;
      }
      options.onUpdate({ type: "success", snapshot });
    } catch {
      if (stopped) {
        return;
      }
      options.onUpdate({ type: "failure" });
    }
    schedule();
  };

  return {
    start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      unsubscribe = subscribeVisibility(() => {
        if (isHidden()) {
          clear();
          return;
        }
        void tick();
      });
      if (!isHidden()) {
        void tick();
      }
    },
    stop() {
      stopped = true;
      clear();
      unsubscribe();
      unsubscribe = () => {};
    },
  };
}

export async function loadAiWorldSnapshot(fetchImpl: typeof fetch = fetch): Promise<AiWorldSnapshot> {
  const response = await fetchImpl("/api/dashboard/ai-world/state", {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);
  const snapshot = response.ok ? readClientSnapshot(payload) : null;
  if (!snapshot) {
    throw new Error("AI World state is unavailable");
  }
  return snapshot;
}
