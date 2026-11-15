import { isDashboardOwner } from "./approval";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReviewerAuthorization =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 | 503; message: string };

export function authorizeReviewer(input: {
  userId: string | null | undefined;
  email: string | null | undefined;
  ownerUserId: string | null | undefined;
  ownerEmail: string | null | undefined;
}): ReviewerAuthorization {
  if (!input.userId) {
    return { ok: false, status: 401, message: "Authentication required" };
  }
  const ownerUserId = input.ownerUserId?.trim() ?? "";
  if (!UUID.test(ownerUserId)) {
    return { ok: false, status: 503, message: "Dashboard authentication is not configured" };
  }
  if (input.userId !== ownerUserId || !isDashboardOwner(input.email, input.ownerEmail)) {
    return { ok: false, status: 403, message: "This dashboard is limited to the Aimpire owner" };
  }
  return { ok: true, userId: ownerUserId };
}
