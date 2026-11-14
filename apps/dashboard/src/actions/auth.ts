"use server";

import { redirect } from "next/navigation";
import { isDashboardOwner } from "../lib/approval";
import { DashboardAccessError } from "../lib/errors";
import { createClient } from "../lib/supabase/server";

export type LoginState = {
  error: string;
};

export async function login(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email.trim() || !password) {
    return { error: "Email and password are required" };
  }

  let supabase;

  try {
    supabase = await createClient();
  } catch (error) {
    if (error instanceof DashboardAccessError) {
      return { error: "Dashboard authentication is not configured" };
    }

    throw error;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    return { error: "Invalid email or password" };
  }

  if (!isDashboardOwner(data.user.email, process.env.DASHBOARD_OWNER_EMAIL)) {
    await supabase.auth.signOut();
    return { error: "This dashboard is limited to the Aimpire owner." };
  }

  redirect("/");
}

export async function logout(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Signing out should still leave the protected pages.
  }

  redirect("/login");
}
