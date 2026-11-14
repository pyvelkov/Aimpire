"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/actions/auth";

const initialState: LoginState = { error: "" };

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="mt-8 space-y-4">
      {notice ? (
        <p role="status" className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-clay">
          {notice}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <label className="block text-sm font-medium" htmlFor="email">
        Email
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 outline-none ring-pine focus:ring-2"
        />
      </label>
      <label className="block text-sm font-medium" htmlFor="password">
        Password
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 outline-none ring-pine focus:ring-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-ink px-3 py-2.5 text-sm font-medium text-card disabled:opacity-60"
      >
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
