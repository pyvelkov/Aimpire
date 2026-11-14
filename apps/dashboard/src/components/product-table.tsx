"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { approvalText } from "@/lib/approval";
import type { ManagedProduct } from "@/lib/product-schema";
import { formatLabel, formatMarkets, formatScore, formatWhen } from "@/lib/presentation";

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

export function ProductTable({ products }: { products: ManagedProduct[] }) {
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
      <label className="block text-sm font-medium" htmlFor="product-search">
        Search products
        <input
          id="product-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, category, status, or market"
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 outline-none ring-pine focus:ring-2"
        />
      </label>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted">
          No products match that search.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <caption className="sr-only">Product candidates</caption>
            <thead className="text-muted">
              <tr className="border-b border-line">
                {columns.map((column) => (
                  <th key={column.key} className="py-2 pr-3 font-medium">
                    <button
                      type="button"
                      onClick={() => chooseSort(column.key)}
                      className="inline-flex items-center gap-1 hover:text-ink"
                      aria-sort={sortKey === column.key ? (direction === "asc" ? "ascending" : "descending") : "none"}
                    >
                      {column.label}
                      {sortKey === column.key ? (direction === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                ))}
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Markets</th>
                <th className="py-2 pr-3 font-medium">Recommendation</th>
                <th className="py-2 font-medium">Approval</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => {
                const decision = product.latest_decision;
                return (
                  <tr key={product.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 pr-3 font-medium">
                      <Link href={`/products/${product.id}`} className="underline decoration-line underline-offset-4 hover:decoration-ink">
                        {product.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{formatLabel(product.status)}</td>
                    <td className="py-3 pr-3">{formatWhen(product.updated_at ?? product.created_at)}</td>
                    <td className="py-3 pr-3">{formatScore(decision?.decision_score ?? null)}</td>
                    <td className="py-3 pr-3">{product.category || "—"}</td>
                    <td className="py-3 pr-3">{formatMarkets(product.target_market)}</td>
                    <td className="py-3 pr-3">{decision?.recommendation_label ?? "No decision"}</td>
                    <td className="py-3">
                      {decision
                        ? approvalText(decision.approved, decision.approval_label)
                        : "Not approved"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
