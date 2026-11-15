import { AiWorldCanvas } from "@/components/ai-world/ai-world-canvas";
import { AiWorldLegend } from "@/components/ai-world/ai-world-legend";

export function AiWorldScreen() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">AI World</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
          A top-down view of headquarters. Characters stay idle unless a saved task is actually in progress.
          Scroll to zoom and drag to look around. Click a character for their profile and saved task history.
        </p>
      </div>
      <AiWorldCanvas />
      <AiWorldLegend />
    </div>
  );
}
