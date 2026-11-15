"use client";

import { useId, useState } from "react";

export type ChartPoint = {
  label: string;
  value: number;
  display?: string;
};

const chartStroke = {
  cyan: "#22d3ee",
  emerald: "#34d399",
  violet: "#a78bfa",
} as const;

function pointText(point: ChartPoint): string {
  return point.display ?? String(point.value);
}

export function MetricChart({
  points,
  stroke,
  empty,
  variant = "area",
}: {
  points: ChartPoint[];
  stroke: keyof typeof chartStroke;
  empty: string;
  variant?: "area" | "bar";
}) {
  const gradientId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const color = chartStroke[stroke];

  if (points.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-sm text-zinc-400">
        {empty}
      </p>
    );
  }

  const current = active == null ? null : points[active];

  return (
    <div className="relative">
      <ul className="sr-only">
        {points.map((point) => (
          <li key={`${point.label}-${point.value}`}>{point.label}: {pointText(point)}</li>
        ))}
      </ul>
      {variant === "bar" ? (
        <BarChart
          points={points}
          color={color}
          active={active}
          onActive={setActive}
        />
      ) : (
        <AreaChart
          points={points}
          color={color}
          gradientId={gradientId}
          active={active}
          onActive={setActive}
        />
      )}
      {current ? (
        <div className="pointer-events-none absolute top-2 right-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 shadow-lg">
          <p className="max-w-48 truncate text-zinc-400">{current.label}</p>
          <p className="mt-0.5 tabular-nums font-medium">{pointText(current)}</p>
        </div>
      ) : null}
    </div>
  );
}

function AreaChart({
  points,
  color,
  gradientId,
  active,
  onActive,
}: {
  points: ChartPoint[];
  color: string;
  gradientId: string;
  active: number | null;
  onActive: (index: number | null) => void;
}) {
  const width = 640;
  const height = 220;
  const pad = { left: 44, right: 12, top: 16, bottom: 28 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const values = points.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min || 1;
  const xAt = (index: number) => (
    points.length === 1
      ? pad.left + innerWidth / 2
      : pad.left + (index / (points.length - 1)) * innerWidth
  );
  const yAt = (value: number) => pad.top + innerHeight - ((value - min) / span) * innerHeight;
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.value)}`).join(" ");
  const area = `${line} L ${xAt(points.length - 1)} ${yAt(min)} L ${xAt(0)} ${yAt(min)} Z`;
  const ticks = [max, min + span / 2, min];

  function nearest(clientX: number, bounds: DOMRect) {
    const ratio = (clientX - bounds.left) / bounds.width;
    const x = ratio * width;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    points.forEach((_, index) => {
      const distance = Math.abs(xAt(index) - x);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    onActive(best);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-56 w-full"
      role="img"
      aria-hidden="true"
      onMouseLeave={() => onActive(null)}
      onMouseMove={(event) => nearest(event.clientX, event.currentTarget.getBoundingClientRect())}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={yAt(tick)}
            y2={yAt(tick)}
            stroke="#27272a"
            strokeDasharray="4 4"
            className="stroke-zinc-800/60"
          />
          <text x={pad.left - 8} y={yAt(tick) + 4} textAnchor="end" fill="#71717a" fontSize="11">
            {compact(tick)}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => (
        <circle
          key={`${point.label}-${index}`}
          cx={xAt(index)}
          cy={yAt(point.value)}
          r={active === index ? 4.5 : 3}
          fill={color}
        />
      ))}
      <text x={xAt(0)} y={height - 8} fill="#71717a" fontSize="11">
        {shortLabel(points[0]?.label ?? "")}
      </text>
      {points.length > 1 ? (
        <text x={xAt(points.length - 1)} y={height - 8} textAnchor="end" fill="#71717a" fontSize="11">
          {shortLabel(points[points.length - 1]?.label ?? "")}
        </text>
      ) : null}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.38" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function BarChart({
  points,
  color,
  active,
  onActive,
}: {
  points: ChartPoint[];
  color: string;
  active: number | null;
  onActive: (index: number | null) => void;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <div className="space-y-3" onMouseLeave={() => onActive(null)}>
      {points.map((point, index) => (
        <button
          key={point.label}
          type="button"
          className="block w-full text-left"
          onMouseEnter={() => onActive(index)}
          onFocus={() => onActive(index)}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="text-zinc-400">{point.label}</span>
            <span className="tabular-nums text-zinc-100">{pointText(point)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800/80">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(4, (point.value / max) * 100)}%`,
                backgroundColor: color,
                opacity: active == null || active === index ? 1 : 0.45,
              }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

function compact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function shortLabel(label: string): string {
  return label.length > 18 ? `${label.slice(0, 16)}…` : label;
}
