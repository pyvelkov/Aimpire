import "server-only";
import { redirect } from "next/navigation";
import { assertOwnerIdentity } from "./auth";
import { loadDashboardResource } from "./agent-api";
import { parseApprovalDetail, parseApprovalList, type ApprovalDetail, type ApprovalRequest } from "./approval-schema";
import { DashboardAccessError, DashboardNotFoundError } from "./errors";

export type ApprovalListResult =
  | { ok: true; approvals: ApprovalRequest[] }
  | { ok: false; message: string };

export type ApprovalDetailResult =
  | { ok: true; approval: ApprovalDetail }
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; message: string };

function redirectForAccess(error: DashboardAccessError): never {
  if (error.status === 403) redirect("/login?error=owner");
  if (error.status === 503) redirect("/login?error=config");
  redirect("/login");
}

export async function loadApprovals(): Promise<ApprovalListResult> {
  try {
    const owner = await assertOwnerIdentity();
    const payload = await loadDashboardResource("approvals", {
      authenticated: true,
      actorId: owner.id,
    });
    return { ok: true, approvals: parseApprovalList(payload) };
  } catch (error) {
    if (error instanceof DashboardAccessError) redirectForAccess(error);
    return { ok: false, message: "Approval requests are unavailable. No review was recorded." };
  }
}

export async function loadApproval(id: string): Promise<ApprovalDetailResult> {
  try {
    const owner = await assertOwnerIdentity();
    const payload = await loadDashboardResource(`approvals/${id}`, {
      authenticated: true,
      actorId: owner.id,
    });
    return { ok: true, approval: parseApprovalDetail(payload) };
  } catch (error) {
    if (error instanceof DashboardNotFoundError) return { ok: false, notFound: true };
    if (error instanceof DashboardAccessError) redirectForAccess(error);
    return { ok: false, notFound: false, message: "This review request is unavailable. No review was recorded." };
  }
}
