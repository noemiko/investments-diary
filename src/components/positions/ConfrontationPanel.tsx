import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import type { ConfrontationState } from "@/lib/confrontation";
import { formatDate } from "@/lib/format";
import { describeResult, NO_PRICE } from "@/lib/result";
import { cn } from "@/lib/utils";
import type { ConfrontationPosition } from "@/types";
import { marketTimestamp } from "@/components/market-prices/client";

const CLAMP_LINES = 3;

// Server HTML carries the full reason, so it reads without JS. Once mounted, a reason longer than
// three lines is clamped behind a toggle; a shorter one never shows the toggle.
function ReasonText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clampable, setClampable] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    setClampable(el.scrollHeight > lineHeight * CLAMP_LINES + 1);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={cn("text-sm whitespace-pre-line text-white/90", clampable && !expanded && "line-clamp-3")}
      >
        {text}
      </p>
      {clampable && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((prev) => !prev);
          }}
          className="mt-1 text-xs text-purple-300 hover:underline focus:ring-2 focus:ring-purple-400 focus:outline-none"
        >
          {expanded ? "Show less" : "Show full reason"}
        </button>
      )}
    </div>
  );
}

function EarlierPosition({ position }: { position: ConfrontationPosition }) {
  const result = describeResult(position);
  return (
    <li data-confrontation-position-id={position.id} className="space-y-1 rounded-lg border border-white/10 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {position.instrument} {position.sell_date !== null && <Badge variant="secondary">Closed</Badge>}
        </span>
        <span className="text-xs text-blue-100/60">Bought {formatDate(position.buy_date)}</span>
      </div>
      {position.reason_text ? (
        <ReasonText text={position.reason_text} />
      ) : (
        <p className="text-sm text-blue-100/50 italic">No reason written</p>
      )}
      {/* No gain/loss colour: the sign carries the direction, and the panel gives no verdict. */}
      <p className="text-sm tabular-nums">
        {result ? (
          <>
            <span className="font-semibold">{result.percent}</span>
            <span className="text-blue-100/60"> {result.asOf}</span>
          </>
        ) : (
          <span className="text-blue-100/60">{NO_PRICE}</span>
        )}
      </p>
      {position.valuation && (
        <p className="text-xs text-blue-100/60">
          {position.valuation.source === "automatic"
            ? "Downloaded quote"
            : position.valuation.source === "manual_override"
              ? "Temporary manual correction"
              : position.valuation.source === "sale"
                ? "Recorded sale"
                : position.valuation.source === "missing"
                  ? "No price"
                  : "Manual price"}{" "}
          · {position.valuation.currency}
          {position.valuation.source !== "sale" && position.valuation.marketAt
            ? ` · Market time ${marketTimestamp(position.valuation.marketAt)}`
            : ""}
        </p>
      )}
      {position.valuation &&
        position.valuation.source !== "sale" &&
        position.valuation.refreshOutcome &&
        !["never", "success"].includes(position.valuation.refreshOutcome) && (
          <p className="text-xs text-blue-100/60">Latest download failed. The last usable saved price is retained.</p>
        )}
    </li>
  );
}

/**
 * The author's earlier positions in the chosen reason category, shown before saving (US-01, FR-012).
 * It presents history only: no score, count or recommendation.
 */
export function ConfrontationPanel({ state }: { state: ConfrontationState }) {
  return (
    <section
      data-confrontation={state.kind}
      aria-labelledby="confrontation-heading"
      className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-white"
    >
      <h2 id="confrontation-heading" className="flex items-center gap-2 text-sm font-semibold text-blue-100">
        <History className="size-4" />
        Bought for the same reason before
      </h2>
      <div aria-live="polite" className="space-y-3">
        {state.kind === "no-category" && (
          <p className="text-sm text-blue-100/70">
            Choose a reason category to see what you bought for the same reason and how it went.
          </p>
        )}
        {state.kind === "unavailable" && (
          <p className="text-sm text-blue-100/70">
            Your earlier positions could not be loaded, so they cannot be shown here. You can still save this
            investment.
          </p>
        )}
        {state.kind === "history" && (
          <>
            {state.existingCategoryName && (
              <p className="text-sm text-blue-100/70">
                “{state.existingCategoryName}” already exists, so this investment will be filed under it.
              </p>
            )}
            {state.positions.length === 0 ? (
              <p data-confrontation-empty className="text-sm text-blue-100/70">
                You have not recorded anything for this reason yet. This will be the first position bought for it.
              </p>
            ) : (
              <>
                <p className="text-sm text-blue-100/70">
                  You have thought this before. How did it go? Read your earlier reasoning before you save.
                </p>
                <ul className="space-y-2">
                  {state.positions.map((position) => (
                    <EarlierPosition key={position.id} position={position} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
