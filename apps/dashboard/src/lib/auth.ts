import "server-only";
import { isDashboardOwner } from "./approval";
import { authorizeReviewer } from "./reviewer";
import { DashboardAccessError } from "./errors";
import { createClient, readAuthEnv } from "./supabase/server";

export async function assertOwner(): Promise<{ email: string }> {
  if (!process.env.DASHBOARD_OWNER_EMAIL) {
    throw new DashboardAccessError(
      503,
      "Dashboard authentication is not configured",
    );
  }

  readAuthEnv();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email;

  if (error || !email) {
    throw new DashboardAccessError(401, "Authentication required");
  }

  if (!isDashboardOwner(email, process.env.DASHBOARD_OWNER_EMAIL)) {
    await supabase.auth.signOut();
    throw new DashboardAccessError(
      403,
      "This dashboard is limited to the Aimpire owner",
    );
  }

  return { email };
}

export async function assertOwnerIdentity(): Promise<{ id: string; email: string }> {
  readAuthEnv();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const decision = authorizeReviewer({
    userId: error ? null : data.user?.id,
    email: data.user?.email,
    ownerUserId: process.env.DASHBOARD_OWNER_USER_ID,
    ownerEmail: process.env.DASHBOARD_OWNER_EMAIL,
  });

  if (!decision.ok) {
    if (decision.status === 403) {
      await supabase.auth.signOut();
    }
    throw new DashboardAccessError(decision.status, decision.message);
  }

  return { id: decision.userId, email: data.user?.email ?? "" };
}
