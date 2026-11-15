"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DecisionReview } from "@/lib/approval";
import type { ManagedProduct } from "@/lib/product-schema";
import { formatLabel, formatMarkets, formatScore, formatWhen } from "@/lib/presentation";
import { DecisionApprovalBadge, EmptyState, StatusBadge, fieldClass, metricLabelClass, surfaceClass, workflowTone } from "@/components/command/chrome";
import { cn } from "@/lib/utils";

type SortKey = "name" | "status" | "updated" | "score";

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Product" },
  { key: "status", label: "Research status" },
  { key: "updated", label: "Updated" },
  { key: "score", label: "Decision score" },
];

function sortValue(product: ManagedProduct, key: SortKey): string | number {
  if (key === "name") return product.name.toLowerCase();
  if (key === "status") return product.status;
  if (key === "score") return product.latest_decision?.decision_score ?? -1;
  return product.updated_at ?? product.created_at;
}

export function ProductTable({
  products,
  reviewsByDecision,
}: {
  products: ManagedProduct[];
  reviewsByDecision: Record<string, DecisionReview>;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = products.filter((product) => {
      if (!needle) return true;
      const haystack = [
        product.name,
        product.category ?? "",
        product.status,
        product.target_market.join(" "),
        product.latest_decision?.recommendation_label ?? "",
        product.latest_decision?.approval_label ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
    return filtered.sort((left, right) => {
      const a = sortValue(left, sortKey);
      const b = sortValue(right, sortKey);
      const comparison = typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a).localeCompare(String(b));
      return direction === "asc" ? comparison : -comparison;
    });
  }, [direction, products, query, sortKey]);

  function chooseSort(key: SortKey) {
    if (sortKey === key) {
      setDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setDirection(key === "name" || key === "status" ? "asc" : "desc");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <label className="block min-w-0 flex-1 text-sm font-medium" htmlFor="product-search">
          Search products
          <input
            id="product-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, category, status, or market"
            className={fieldClass}
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sort products">
          {columns.map((column) => (
            <button
              key={column.key}
              type="button"
              onClick={() => chooseSort(column.key)}
              aria-sort={sortKey === column.key ? (direction === "asc" ? "ascending" : "descending") : "none"}
              className={cn(
                "rounded-lg px-3 py-2 text-sm transition-colors duration-200",
                sortKey === column.key
                  ? "border border-zinc-700/50 bg-zinc-800/80 text-white"
                  : "border border-transparent text-zinc-400 hover:text-zinc-100",
              )}
            >
              {column.label}
              {sortKey === column.key ? (direction === "asc" ? " ↑" : " ↓") : ""}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState>No products match that search.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((product) => {
            const decision = product.latest_decision;
            return (
              <li key={product.id} className={cn(surfaceClass, "p-4")}>
                <Link href={`/products/${product.id}`} className="block space-y-3">
                    <div>
                      <h3 className="font-medium text-zinc-100">{product.name}</h3>
                      <p className="mt-1 text-sm text-zinc-400">
                        {product.category || "No category"} · {formatMarkets(product.target_market)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={workflowTone(product.status)}>{formatLabel(product.status)}</StatusBadge>
                      <StatusBadge tone={decision ? workflowTone(decision.recommendation) : "neutral"}>
                        {decision?.recommendation_label ?? "No decision"}
                      </StatusBadge>
                      <DecisionApprovalBadge
                        approved={decision?.approved ?? false}
                        label={decision?.approval_label ?? "Not approved"}
                        reviewStatus={decision ? reviewsByDecision[decision.id]?.status : null}
                      />
                    </div>
                    <dl className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className={metricLabelClass}>Decision score</dt>
                        <dd className="mt-1 tabular-nums text-sm font-semibold text-zinc-100">
                          {formatScore(decision?.decision_score ?? null)}
                        </dd>
                      </div>
                      <div>
                        <dt className={metricLabelClass}>Updated</dt>
                        <dd className="mt-1 text-sm tabular-nums text-zinc-300">
                          {formatWhen(product.updated_at ?? product.created_at)}
                        </dd>
                      </div>
                    </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
