import type { ReactNode } from "react";
import { approvalText } from "@/lib/approval";
import { cn } from "@/lib/utils";
import { NumberTicker } from "@/components/ui/number-ticker";

export const surfaceClass =
  "rounded-xl border border-zinc-800/80 bg-zinc-900/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-md transition-colors duration-200 hover:border-zinc-700";

export const fieldClass =
  "mt-1 w-full rounded-xl border border-zinc-800/80 bg-zinc-950 px-3 py-2 text-sm font-normal text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-600 focus:ring-2 focus:ring-cyan-400/30";

export const metricLabelClass = "text-xs font-medium uppercase tracking-wider text-zinc-400";

export const metricValueClass = "tabular-nums font-semibold tracking-tight text-2xl text-zinc-100";

const badgeTones = {
  approved: "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  pending: "border border-amber-500/20 bg-amber-500/10 text-amber-400",
  rejected: "border border-rose-500/20 bg-rose-500/10 text-rose-400",
  neutral: "border border-zinc-700/60 bg-zinc-800/80 text-zinc-300",
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function workflowTone(status: string): BadgeTone {
  const value = status.toLowerCase();
  if (
    value.includes("unavailable")
    || value.includes("unverified")
    || value.includes("missing")
    || value.includes("unknown")
    || value === "not_approved"
    || value.includes("not approved")
  ) {
    return value === "not_approved" || value.includes("not approved") ? "rejected" : "pending";
  }
  if (
    value === "approved"
    || value === "completed"
    || value === "verified"
    || value === "confirmed"
    || value.includes("available")
  ) {
    return "approved";
  }
  if (value === "rejected" || value === "failed" || value === "cancelled" || value === "hold") {
    return "rejected";
  }
  if (
    value === "pending"
    || value === "ready_for_review"
    || value === "in_progress"
    || value === "queued"
    || value === "proposed"
  ) {
    return "pending";
  }
  return "neutral";
}

export function approvalTone(approved: boolean): BadgeTone {
  return approved ? "approved" : "rejected";
}

export function marginTone(margin: number | null): BadgeTone {
  if (margin == null || !Number.isFinite(margin)) {
    return "neutral";
  }
  return margin > 0 ? "approved" : "rejected";
}

export function DecisionApprovalBadge({
  approved,
  label,
  reviewStatus,
}: {
  approved: boolean;
  label: string;
  reviewStatus?: string | null;
}) {
  if (reviewStatus === "approved") {
    return <StatusBadge tone="approved">Approved</StatusBadge>;
  }
  if (reviewStatus === "pending") {
    return <StatusBadge tone="pending">Pending review</StatusBadge>;
  }
  if (reviewStatus === "rejected") {
    return <StatusBadge tone="rejected">Review rejected</StatusBadge>;
  }
  return <StatusBadge tone={approvalTone(approved)}>{approvalText(approved, label)}</StatusBadge>;
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", badgeTones[tone])}>
      {children}
    </span>
  );
}

export function Surface({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={cn(surfaceClass, "p-4 sm:p-5", className)}>{children}</section>;
}

export function PageIntro({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">{children}</p>
    </div>
  );
}

export function Unavailable({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-5 text-rose-300">
      <h2 className="text-lg font-semibold text-rose-200">{title}</h2>
      <p className="mt-2 text-sm">{message}</p>
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-sm text-zinc-400">
      {children}
    </p>
  );
}

export function MetricFigure({
  label,
  value,
  detail,
  decimalPlaces = 0,
}: {
  label: string;
  value: number | null;
  detail: string;
  decimalPlaces?: number;
}) {
  const ready = value != null && Number.isFinite(value);
  return (
    <article className={cn(surfaceClass, "p-4")}>
      <h2 className={metricLabelClass}>{label}</h2>
      {ready ? (
        <NumberTicker
          value={value}
          decimalPlaces={decimalPlaces}
          className={cn(metricValueClass, "mt-3")}
        />
      ) : (
        <p className={cn(metricValueClass, "mt-3")}>—</p>
      )}
      <p className="mt-2 text-sm text-zinc-400">{detail}</p>
    </article>
  );
}

