"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/actions/auth";
import { fieldClass } from "@/components/command/chrome";

const initialState: LoginState = { error: "" };

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="mt-8 space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md">
      {notice ? (
        <p role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {notice}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
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
          className={fieldClass}
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
          className={fieldClass}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-100 px-3 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-60"
      >
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
