"use client";

import { useActionState } from "react";
import { createReviewRequest, type ReviewActionState } from "@/actions/approvals";
import { fieldClass } from "@/components/command/chrome";

const initialState: ReviewActionState = { error: "", done: false };

export function RequestReviewForm({ decisionId }: { decisionId: string }) {
  const [state, action, pending] = useActionState(createReviewRequest, initialState);

  return (
    <form action={action} className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
      <p className="text-sm text-zinc-400">
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
          className={fieldClass}
        />
      </label>
      {state.error ? <p role="alert" className="text-sm text-rose-400">{state.error}</p> : null}
      {state.done ? <p role="status" className="text-sm text-emerald-400">Review request recorded.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 shadow-sm shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-60"
      >
        {pending ? "Requesting" : "Request product review"}
      </button>
    </form>
  );
}
