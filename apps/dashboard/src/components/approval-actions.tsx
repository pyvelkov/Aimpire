"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveReview } from "@/actions/approvals";

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
        <button type="button" className="rounded-xl bg-ink px-3 py-2 text-sm font-medium text-card" onClick={() => setChoice("approved")}>
          Approve review
        </button>
        <button type="button" className="rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-line" onClick={() => setChoice("rejected")}>
          Reject review
        </button>
      </div>
      {choice ? (
        <div role="dialog" aria-modal="true" aria-labelledby="review-confirm-title" className="rounded-xl border border-line bg-paper p-4">
          <h3 id="review-confirm-title" className="font-medium">
            {choice === "approved" ? "Record this review as approved?" : "Record this review as rejected?"}
          </h3>
          <p className="mt-2 text-sm text-muted">
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
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal"
            />
          </label>
          {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} onClick={confirm} className="rounded-xl bg-ink px-3 py-2 text-sm font-medium text-card disabled:opacity-60">
              {pending ? "Saving" : "Confirm"}
            </button>
            <button type="button" disabled={pending} onClick={() => setChoice(null)} className="rounded-xl px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
