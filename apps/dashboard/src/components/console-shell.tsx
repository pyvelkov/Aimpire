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
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-900/50 px-3 py-5 backdrop-blur-xl md:flex">
        <div className="px-3">
          <p className="text-xs font-semibold tracking-[0.28em] text-zinc-400">AIMPIRE</p>
          <p className="mt-1 text-sm font-medium text-zinc-100">Command Center</p>
        </div>
        <div className="mt-6">
          <ConsoleNav orientation="column" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.28em] text-zinc-500 md:hidden">AIMPIRE</p>
              <h1 className="text-sm font-medium tracking-tight text-zinc-100">Command Center</h1>
              <p className="text-xs text-zinc-400">Read-only operational view</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="hidden max-w-56 truncate text-sm text-zinc-400 sm:block">{email}</p>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-700/60 bg-zinc-800/80 px-3 py-1.5 text-sm text-zinc-300 transition-colors duration-200 hover:border-zinc-600 hover:text-zinc-100"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <div className="px-4 pb-3 md:hidden">
            <ConsoleNav />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
