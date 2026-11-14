import { logout } from "@/actions/auth";
import { ConsoleNav } from "@/components/console-nav";

export function ConsoleShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-pine">AIMPIRE</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Command Center</h1>
          <p className="mt-1 text-sm text-muted">Read-only operational view</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="max-w-56 truncate text-sm text-muted">{email}</p>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-full bg-card px-3 py-1.5 text-sm ring-1 ring-line hover:bg-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="py-5">
        <ConsoleNav />
      </div>
      <main className="flex-1 pb-10">{children}</main>
    </div>
  );
}
