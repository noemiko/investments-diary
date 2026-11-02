import { useEffect, useRef, useState } from "react";
import { aggregateAmount, historyGeometry, historyRange, type HistoryRange } from "@/lib/wallet-history";
import { formatAmount, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MarketCurrency, WalletSnapshot } from "@/types";

const timestamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
    new Date(value),
  ) + " UTC";
function CurrencyTimeline({
  snapshots,
  today,
  currency,
}: {
  snapshots: WalletSnapshot[];
  today: string;
  currency: MarketCurrency;
}) {
  const chartRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(240, entry.contentRect.width));
    });
    observer.observe(chart);
    return () => {
      observer.disconnect();
    };
  }, []);
  const [range, setRange] = useState<HistoryRange>("90");
  const [selected, setSelected] = useState<string | null>(null);
  const points = historyRange(snapshots, range, today);
  const geometry = historyGeometry(points).map((entry) => ({
    ...entry,
    x: 24 + ((entry.x - 24) / 672) * (width - 48),
  }));
  // Resolve by time-axis distance, independent of overlapping SVG hit targets.
  const selectAt = (event: { currentTarget: SVGSVGElement; clientX: number; clientY: number }) => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix || !geometry.length) return;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const nearest = geometry.reduce((best, entry) =>
      Math.abs(entry.x - local.x) < Math.abs(best.x - local.x) ? entry : best,
    );
    setSelected(nearest.point.observation_day);
  };
  const ordered = [...points].sort((a, b) =>
    aggregateAmount(a.value).units < aggregateAmount(b.value).units
      ? -1
      : aggregateAmount(a.value).units > aggregateAmount(b.value).units
        ? 1
        : 0,
  );
  const current = points.find((p) => p.observation_day === selected) ?? points.at(-1);
  const last = snapshots.at(-1);
  return (
    <section
      ref={chartRef}
      aria-labelledby={`wallet-history-${currency}`}
      className="border-border min-w-0 space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <div>
        <h3 id={`wallet-history-${currency}`} className="text-lg font-semibold">
          {currency} observations
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Daily observations at midnight UTC use saved effective prices. Downloaded quotes may be old; capture does not
          download prices.
        </p>
        {last && (
          <p className="text-muted-foreground mt-2 text-sm">
            Last observation: {timestamp(last.captured_at)}. The live total above may differ.
          </p>
        )}
        {last && last.observation_day < today && (
          <p className="text-muted-foreground text-sm">No observation for today yet. Missing days remain gaps.</p>
        )}
      </div>
      <div role="group" aria-label="History period" className="flex flex-wrap gap-2">
        {(
          [
            ["30", "1 month"],
            ["90", "3 months"],
            ["365", "1 year"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={range === value}
            onClick={() => {
              setRange(value);
              setSelected(null);
            }}
            className={cn(
              "focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none",
              range === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <noscript>
        <p className="text-muted-foreground text-sm">
          Showing the default 3-month period. Enable JavaScript to change periods or select points; the observation
          table works without it.
        </p>
      </noscript>
      {!snapshots.length ? (
        <p className="text-muted-foreground">Waiting for the first daily observation</p>
      ) : !points.length ? (
        <p className="text-muted-foreground">No observations in this period. Choose a longer range.</p>
      ) : (
        <>
          <svg
            onPointerMove={(event) => {
              if (event.pointerType !== "touch") selectAt(event);
            }}
            onClick={selectAt}
            viewBox={`0 0 ${width} 260`}
            role="group"
            aria-label="Daily wallet value chart. Focus or tap a point for details."
            className="bg-muted/20 w-full overflow-visible rounded-lg"
          >
            <line x1="24" y1="230" x2={width - 24} y2="230" stroke="var(--border)" />
            {geometry.map(({ point, x, y, connected }, index) => (
              <g key={point.observation_day}>
                {connected && (
                  <line
                    x1={geometry[index - 1].x}
                    y1={geometry[index - 1].y}
                    x2={x}
                    y2={y}
                    stroke="var(--chart-2)"
                    strokeWidth="2"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={current?.observation_day === point.observation_day ? 6 : 3}
                  fill="var(--chart-2)"
                />
                <circle
                  cx={x}
                  cy={y}
                  r="10"
                  fill="transparent"
                  role="button"
                  tabIndex={0}
                  aria-label={`${formatDate(point.observation_day)}: ${formatAmount(aggregateAmount(point.value))}`}
                  onFocus={() => {
                    setSelected(point.observation_day);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(point.observation_day);
                    }
                  }}
                  className="focus:stroke-ring cursor-pointer focus:stroke-2 focus:outline-none"
                >
                  <title>{`${formatDate(point.observation_day)}: ${formatAmount(aggregateAmount(point.value))}`}</title>
                </circle>
              </g>
            ))}
          </svg>
          <div className="text-muted-foreground flex justify-between gap-3 text-xs">
            <span>{formatDate(points[0].observation_day)}</span>
            <span>{formatDate(points[points.length - 1].observation_day)}</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Low {formatAmount(aggregateAmount(ordered[0].value))} · High{" "}
            {formatAmount(aggregateAmount(ordered[ordered.length - 1].value))}. Gaps indicate missing daily
            observations.
          </p>
          {current && (
            <div aria-live="polite" className="bg-muted/40 rounded-lg p-4 text-sm" data-history-details>
              <p className="font-semibold">
                {timestamp(current.captured_at)} · {formatAmount(aggregateAmount(current.value))}
              </p>
              <p>
                Realised: {formatAmount(aggregateAmount(current.realised_change))} · Open:{" "}
                {formatAmount(aggregateAmount(current.open_change))}
              </p>
              <p>
                {current.realised_count + current.open_count} counted ({current.realised_count} closed,{" "}
                {current.open_count} open) · {current.not_counted} excluded
              </p>
              <p>
                {current.automatic_count == null || current.manual_count == null
                  ? "Source coverage is unavailable for this observation."
                  : `${current.automatic_count} automatic · ${current.manual_count} manual open prices`}
                {current.oldest_market_at
                  ? ` · Oldest automatic market time ${timestamp(current.oldest_market_at)}`
                  : ""}
              </p>
              <p>
                {current.as_of
                  ? `Open prices as of ${formatDate(current.as_of)}`
                  : current.realised_count
                    ? "Realised results only"
                    : "No counted results"}
              </p>
            </div>
          )}
          <details>
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Observation data ({points.length})
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Exact recorded daily wallet observations in the selected period</caption>
                <thead>
                  <tr>
                    {["Captured (UTC)", "Value", "Realised", "Open", "Counted / excluded", "Open quotes as of"].map(
                      (heading) => (
                        <th key={heading} scope="col" className="p-2 whitespace-nowrap">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.observation_day} className="border-t">
                      <td className="p-2 whitespace-nowrap">{timestamp(point.captured_at)}</td>
                      {[point.value, point.realised_change, point.open_change].map((amount, i) => (
                        <td key={i} className="p-2 tabular-nums">
                          {formatAmount(aggregateAmount(amount))}
                        </td>
                      ))}
                      <td className="p-2">
                        {point.realised_count + point.open_count} / {point.not_counted}
                      </td>
                      <td className="p-2">{point.as_of ? formatDate(point.as_of) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

/** Display recorded observations by denomination without changing stored amounts. */
export function WalletTimeline({ snapshots, today }: { snapshots: WalletSnapshot[]; today: string }) {
  const currencies = [...new Set(snapshots.map((point) => point.currency))];
  return (
    <section className="min-w-0 space-y-4" aria-labelledby="wallet-history-title">
      <h2 id="wallet-history-title" className="text-xl font-semibold">
        Recorded daily wallet value
      </h2>
      {!snapshots.length && <p className="text-muted-foreground">Waiting for the first daily observation</p>}
      {currencies.map((currency) => (
        <CurrencyTimeline
          key={currency}
          snapshots={snapshots.filter((point) => point.currency === currency)}
          today={today}
          currency={currency}
        />
      ))}
    </section>
  );
}
