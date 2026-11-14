export function formatMarkets(markets: string[]): string {
  if (markets.length === 0) {
    return "No market recorded";
  }

  return markets.join(" + ");
}

export function formatScore(score: number | null): string {
  if (score == null || !Number.isFinite(score)) {
    return "—";
  }

  return `${Math.round(score)}/100`;
}

export function formatWhen(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatLabel(value: string): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatMoney(amount: number | null, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) {
    return "—";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

export function formatPercent(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) {
    return "—";
  }

  return `${amount.toFixed(1)}%`;
}
