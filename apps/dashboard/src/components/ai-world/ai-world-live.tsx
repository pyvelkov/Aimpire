"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { departmentById } from "@/lib/ai-world/departments";
import { departmentActivity } from "@/lib/ai-world/presence";
import { createAiWorldPoller, loadAiWorldSnapshot } from "@/lib/ai-world/poll";
import { reduceConnection, snapshotOf, type AiWorldConnection } from "@/lib/ai-world/snapshot";
import type { DepartmentId } from "@/lib/ai-world/types";
import { formatWhen } from "@/lib/presentation";
import { agentsPageHref } from "@/lib/task-status";
import { AiWorldStage } from "./ai-world-stage";

function statusCopy(connection: AiWorldConnection): string {
  if (connection.kind === "loading") {
    return "Checking saved headquarters records…";
  }
  if (connection.kind === "unavailable") {
    return "Headquarters records are unavailable.";
  }
  const when = formatWhen(connection.confirmedAt);
  if (connection.kind === "stale") {
    return `Stale · last confirmed ${when}. This is not a live view.`;
  }
  return `Live · confirmed ${when}`;
}

function AiWorldStatus({ connection }: { connection: AiWorldConnection }) {
  const snapshot = snapshotOf(connection);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className={connection.kind === "stale" ? "text-clay" : "text-muted"}>{statusCopy(connection)}</p>
      {snapshot ? (
        <Link href="/approvals" className="rounded-full bg-card px-3 py-1.5 ring-1 ring-line hover:text-ink">
          Pending product reviews: {snapshot.pending_product_reviews}
        </Link>
      ) : (
        <p className="text-muted">Pending product reviews unavailable</p>
      )}
    </div>
  );
}

function AgentDetails({
  departmentId,
  connection,
  onClose,
}: {
  departmentId: DepartmentId;
  connection: AiWorldConnection;
  onClose: () => void;
}) {
  const department = departmentById(departmentId);
  const snapshot = snapshotOf(connection);
  const state = snapshot?.departments.find((entry) => entry.department_id === departmentId) ?? null;
  const stale = connection.kind === "stale";

  return (
    <aside className="absolute right-3 bottom-14 z-20 w-72 rounded-2xl bg-card p-4 text-sm shadow-sm ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{department.label}</h3>
          <p className="text-muted">{department.agent.displayName}</p>
        </div>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink">
          Close
        </button>
      </div>
      {state ? (
        <>
          <p className="mt-3 font-medium">{departmentActivity(state)}</p>
          {stale ? <p className="mt-1 text-clay">These counts are not live.</p> : null}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-muted">
            <div>Queued <span className="block text-ink">{state.queued}</span></div>
            <div>Running <span className="block text-ink">{state.running}</span></div>
            <div>Completed <span className="block text-ink">{state.completed}</span></div>
            <div>Failed <span className="block text-ink">{state.failed}</span></div>
          </dl>
          <p className="mt-3 text-muted">
            {state.current_task ? `Running: ${state.current_task.title}` : "No task is in progress."}
          </p>
        </>
      ) : (
        <p className="mt-3 text-muted">Task counts are not available yet.</p>
      )}
      <Link href={agentsPageHref({ agent: departmentId })} className="mt-3 inline-block font-medium text-pine">
        View department tasks
      </Link>
    </aside>
  );
}

export function AiWorldLive() {
  const [connection, setConnection] = useState<AiWorldConnection>({ kind: "loading" });
  const [selected, setSelected] = useState<DepartmentId | null>(null);

  useEffect(() => {
    const poller = createAiWorldPoller({
      load: () => loadAiWorldSnapshot(),
      onUpdate: (event) => {
        setConnection((current) => reduceConnection(current, event));
      },
    });
    poller.start();
    return () => poller.stop();
  }, []);

  return (
    <div className="space-y-3">
      <AiWorldStatus connection={connection} />
      <div className="relative h-[min(72vh,680px)] min-h-[420px] overflow-hidden rounded-2xl bg-[#1a2420] shadow-sm ring-1 ring-line">
        {connection.kind === "stale" ? (
          <p className="absolute top-3 left-3 z-20 rounded-full bg-clay px-3 py-1 text-xs text-card">
            Stale
          </p>
        ) : null}
        <AiWorldStage snapshot={snapshotOf(connection)} onSelect={setSelected} />
        {selected ? (
          <AgentDetails departmentId={selected} connection={connection} onClose={() => setSelected(null)} />
        ) : null}
      </div>
    </div>
  );
}
