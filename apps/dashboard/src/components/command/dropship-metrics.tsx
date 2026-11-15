import { cn } from "@/lib/utils";
import { formatLabel, formatMoney, formatPercent } from "@/lib/presentation";
import { metricLabelClass, metricValueClass, marginTone, StatusBadge, workflowTone } from "@/components/command/chrome";

export type MarketMetric = {
  market: string;
  supplierCost: number | null;
  retail: number | null;
  profit: number | null;
  margin: number | null;
  shipping: string | null;
  currency: string;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function readMarketMetrics(snapshot: Record<string, unknown>): MarketMetric[] {
  const markets = snapshot.markets;
  if (!markets || typeof markets !== "object") {
    return [];
  }

  return Object.entries(markets as Record<string, unknown>).flatMap(([key, value]) => {
    if (!value || typeof value !== "object") {
      return [];
    }
    const row = value as Record<string, unknown>;
    const calculation = row.calculation && typeof row.calculation === "object"
      ? row.calculation as Record<string, unknown>
      : {};
    const currency = typeof calculation.currency === "string" && calculation.currency
      ? calculation.currency
      : "USD";
    return [{
      market: typeof row.market === "string" ? row.market : key,
      supplierCost: asNumber(calculation.product_cost),
      retail: asNumber(calculation.selling_price),
      profit: asNumber(row.contribution_profit_after_ads),
      margin: asNumber(row.contribution_margin_percent),
      shipping: typeof row.shipping_market_status === "string" ? row.shipping_market_status : null,
      currency,
    }];
  });
}

export function DropshipMetrics({
  supplierCost,
  supplierCurrency,
  retail,
  profit,
  margin,
  currency,
  shipping,
}: {
  supplierCost: number | null;
  supplierCurrency: string;
  retail: number | null;
  profit: number | null;
  margin: number | null;
  currency: string;
  shipping?: string | null;
}) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3">
        <Metric label="Supplier cost" value={formatMoney(supplierCost, supplierCurrency)} />
        <Metric label="Target retail" value={formatMoney(retail, currency)} />
        <Metric label="Estimated profit" value={formatMoney(profit, currency)} />
        <div className="rounded-lg bg-zinc-950 px-3 py-2">
          <dt className={metricLabelClass}>Margin</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            <span className={cn(metricValueClass, "text-lg")}>{formatPercent(margin)}</span>
            {margin != null ? (
              <StatusBadge tone={marginTone(margin)}>
                {margin > 0 ? "High margin" : "Low margin"}
              </StatusBadge>
            ) : null}
          </dd>
        </div>
      </dl>
      {shipping ? (
        <StatusBadge tone={workflowTone(shipping)}>
          Shipping {formatLabel(shipping)}
        </StatusBadge>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-950 px-3 py-2">
      <dt className={metricLabelClass}>{label}</dt>
      <dd className={cn(metricValueClass, "mt-1 text-lg")}>{value}</dd>
    </div>
  );
}
