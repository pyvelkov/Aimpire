import Link from "next/link";

export default function TaskNotFound() {
  return (
    <section className="max-w-xl rounded-2xl bg-card p-6 shadow-sm ring-1 ring-line">
      <h2 className="text-2xl font-semibold tracking-tight">Task not found</h2>
      <p className="mt-2 text-sm text-muted">That task is not in the saved agent task records.</p>
      <Link href="/agents" className="mt-4 inline-block text-sm text-pine underline-offset-4 hover:underline">
        Back to agents
      </Link>
    </section>
  );
}
