"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AiWorldProfile } from "@/components/ai-world/ai-world-profile";
import { createAiWorldPoller, loadAiWorldSnapshot } from "@/lib/ai-world/poll";
import {
  loadAgentProfile,
  loadAgentProfiles,
  profileForDepartment,
  type AgentProfile,
  type AgentProfileAvailability,
} from "@/lib/ai-world/profiles";
import { reduceConnection, snapshotOf, type AiWorldConnection } from "@/lib/ai-world/snapshot";
import type { DepartmentId } from "@/lib/ai-world/types";
import { formatWhen } from "@/lib/presentation";
import { AiWorldStage } from "./ai-world-stage";

type ProfileCatalog =
  | { kind: "loading" }
  | { kind: "ready"; profiles: AgentProfile[] }
  | { kind: "unavailable" };

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

function AiWorldStatus({
  connection,
  catalog,
}: {
  connection: AiWorldConnection;
  catalog: ProfileCatalog;
}) {
  const snapshot = snapshotOf(connection);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div>
        <p className={connection.kind === "stale" ? "text-clay" : "text-muted"}>{statusCopy(connection)}</p>
        {catalog.kind === "unavailable" ? (
          <p className="text-clay">Character profiles are unavailable.</p>
        ) : null}
      </div>
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

export function AiWorldLive() {
  const [connection, setConnection] = useState<AiWorldConnection>({ kind: "loading" });
  const [selected, setSelected] = useState<DepartmentId | null>(null);
  const [catalog, setCatalog] = useState<ProfileCatalog>({ kind: "loading" });
  const [detail, setDetail] = useState<AgentProfile | null>(null);
  const [detailState, setDetailState] = useState<AgentProfileAvailability>("loading");

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

  useEffect(() => {
    let cancelled = false;
    void loadAgentProfiles()
      .then((profiles) => {
        if (!cancelled) {
          setCatalog({ kind: "ready", profiles });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalog({ kind: "unavailable" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      return;
    }
    if (catalog.kind === "loading") {
      setDetail(null);
      setDetailState("loading");
      return;
    }
    if (catalog.kind === "unavailable") {
      setDetail(null);
      setDetailState("unavailable");
      return;
    }

    const saved = profileForDepartment(catalog.profiles, selected);
    if (!saved) {
      setDetail(null);
      setDetailState("missing");
      return;
    }

    setDetail(saved);
    setDetailState("ready");
    let cancelled = false;
    void loadAgentProfile(saved.id)
      .then((profile) => {
        if (cancelled) {
          return;
        }
        if (!profile || profile.agent_type !== selected) {
          setDetail(null);
          setDetailState("missing");
          return;
        }
        setDetail(profile);
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(saved);
          setDetailState("ready");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [catalog, selected]);

  const snapshot = snapshotOf(connection);

  return (
    <div className="space-y-3">
      <AiWorldStatus connection={connection} catalog={catalog} />
      <div className="relative h-[min(72vh,680px)] min-h-[420px] overflow-hidden rounded-2xl bg-[#1a2420] shadow-sm ring-1 ring-line">
        {connection.kind === "stale" ? (
          <p className="absolute top-3 left-3 z-20 rounded-full bg-clay px-3 py-1 text-xs text-card">
            Stale
          </p>
        ) : null}
        <AiWorldStage snapshot={snapshot} onSelect={setSelected} />
        {selected ? (
          <AiWorldProfile
            departmentId={selected}
            connection={connection}
            profile={detail}
            profileState={detailState}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
