"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertOwnerIdentity } from "../lib/auth";
import { loadDashboardResource } from "../lib/agent-api";
import { DashboardAccessError, DashboardNotFoundError, DashboardWorkflowError } from "../lib/errors";

export type ReviewActionState = {
  error: string;
  done: boolean;
};

function failure(error: unknown): ReviewActionState {
  if (error instanceof DashboardWorkflowError || error instanceof DashboardAccessError || error instanceof DashboardNotFoundError) {
    return { error: error.message, done: false };
  }
  return { error: "The review could not be recorded.", done: false };
}

export async function createReviewRequest(
  _state: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  try {
    const owner = await assertOwnerIdentity();
    const decisionId = String(formData.get("decision_id") ?? "");
    const notes = String(formData.get("notes") ?? "");
    const payload = await loadDashboardResource("approvals", {
      authenticated: true,
      method: "POST",
      actorId: owner.id,
      body: { decision_id: decisionId, notes },
    });
    revalidatePath("/");
    revalidatePath("/approvals");
    revalidatePath("/products");
    revalidatePath("/products/[id]", "page");
    const requestId = payload && typeof payload === "object" && "approval" in payload
      ? (payload as { approval?: { id?: string } }).approval?.id
      : undefined;
    if (requestId) {
      redirect(`/approvals/${requestId}`);
    }
    return { error: "", done: true };
  } catch (error) {
    return failure(error);
  }
}

export async function resolveReview(
  requestId: string,
  decision: "approved" | "rejected",
  notes: string,
): Promise<ReviewActionState> {
  try {
    const owner = await assertOwnerIdentity();
    await loadDashboardResource(`approvals/${requestId}/${decision === "approved" ? "approve" : "reject"}`, {
      authenticated: true,
      method: "POST",
      actorId: owner.id,
      body: { notes },
    });
    revalidatePath("/");
    revalidatePath("/approvals");
    revalidatePath(`/approvals/${requestId}`);
    revalidatePath("/products");
    revalidatePath("/products/[id]", "page");
    return { error: "", done: true };
  } catch (error) {
    return failure(error);
  }
}
