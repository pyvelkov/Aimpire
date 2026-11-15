import { secretsMatch } from "./internal-auth.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACTOR_ID_HEADER = "x-aimpire-actor-id";

export type ReviewerDecision =
  | { ok: true; actorId: string }
  | { ok: false; status: 403 | 503 };

export function resolveReviewer(
  actorHeader: string | null,
  env: NodeJS.ProcessEnv = process.env,
): ReviewerDecision {
  const ownerUserId = env.DASHBOARD_OWNER_USER_ID?.trim() ?? "";
  if (!UUID.test(ownerUserId)) {
    return { ok: false, status: 503 };
  }
  if (!actorHeader || !UUID.test(actorHeader) || !secretsMatch(actorHeader, ownerUserId)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, actorId: ownerUserId };
}
