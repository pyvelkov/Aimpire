"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveReview } from "@/actions/approvals";
import { cn } from "@/lib/utils";
import { fieldClass, surfaceClass } from "@/components/command/chrome";

export function ApprovalActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState<"approved" | "rejected" | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (!choice) return;
    setPending(true);
    setError("");
    const result = await resolveReview(requestId, choice, notes);
    setPending(false);
    if (!result.done) {
      setError(result.error);
      return;
    }
    setChoice(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-emerald-500/20 transition-colors duration-200 hover:bg-emerald-400 disabled:opacity-60"
          onClick={() => setChoice("approved")}
        >
          Approve
        </button>
        <button
          type="button"
          className="rounded-lg border border-zinc-700/60 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-300 transition-colors duration-200 hover:border-rose-500/30 hover:bg-rose-500/15 hover:text-rose-400"
          onClick={() => setChoice("rejected")}
        >
          Reject
        </button>
      </div>
      {choice ? (
        <div role="dialog" aria-modal="true" aria-labelledby="review-confirm-title" className={cn(surfaceClass, "bg-zinc-950 p-4")}>
          <h3 id="review-confirm-title" className="font-medium">
            {choice === "approved" ? "Record this review as approved?" : "Record this review as rejected?"}
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            This only records your review of the decision. It does not approve the product for sale, store publishing, purchasing, advertising, or agent execution.
          </p>
          <label className="mt-3 block text-sm font-medium" htmlFor="review-decision-notes">
            Reviewer notes, optional
            <textarea
              id="review-decision-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              className={fieldClass}
            />
          </label>
          {error ? <p role="alert" className="mt-2 text-sm text-rose-400">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={confirm}
              className={choice === "approved"
                ? "rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-60"
                : "rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-60"}
            >
              {pending ? "Saving" : "Confirm"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setChoice(null)}
              className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-100 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
