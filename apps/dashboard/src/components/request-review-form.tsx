"use client";

import { useActionState } from "react";
import { createReviewRequest, type ReviewActionState } from "@/actions/approvals";

const initialState: ReviewActionState = { error: "", done: false };

export function RequestReviewForm({ decisionId }: { decisionId: string }) {
  const [state, action, pending] = useActionState(createReviewRequest, initialState);

  return (
    <form action={action} className="mt-4 space-y-3 border-t border-line pt-4">
      <p className="text-sm text-muted">
        Request a product review for this saved decision. Sending the request does not approve the product for sale.
      </p>
      <input type="hidden" name="decision_id" value={decisionId} />
      <label className="block text-sm font-medium" htmlFor={`review-notes-${decisionId}`}>
        Notes, optional
        <textarea
          id={`review-notes-${decisionId}`}
          name="notes"
          rows={3}
          maxLength={2000}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal"
        />
      </label>
      {state.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      {state.done ? <p role="status" className="text-sm text-pine">Review request recorded.</p> : null}
      <button type="submit" disabled={pending} className="rounded-xl bg-ink px-3 py-2 text-sm font-medium text-card disabled:opacity-60">
        {pending ? "Requesting" : "Request product review"}
      </button>
    </form>
  );
}
