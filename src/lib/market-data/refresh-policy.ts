import type { MarketDataFailure } from "@/types";
import { YAHOO_BATCH_SIZE, YAHOO_REQUEST_BUDGET_MS } from "./yahoo";

/** Keep distinct full identities with the same symbol in separate provider requests. */
export function quoteBatches<T extends { symbol: string }>(items: readonly T[]): T[][] {
  const pending = [...items];
  const batches: T[][] = [];
  while (pending.length) {
    const batch: T[] = [];
    const symbols = new Set<string>();
    for (let i = 0; i < pending.length && batch.length < YAHOO_BATCH_SIZE;) {
      if (symbols.has(pending[i].symbol)) {
        i++;
        continue;
      }
      const [item] = pending.splice(i, 1);
      symbols.add(item.symbol);
      batch.push(item);
    }
    batches.push(batch);
  }
  return batches;
}

/** One deadline and fresh signal for the whole click, including sequential batches. */
export function providerBudget(parent?: AbortSignal, timeoutMs = YAHOO_REQUEST_BUDGET_MS) {
  const controller = new AbortController();
  let failure: MarketDataFailure | null = null;
  let resolveStop: (value: MarketDataFailure) => void = () => undefined;
  const stopped = new Promise<MarketDataFailure>((resolve) => {
    resolveStop = resolve;
  });
  function stop(reason: "timeout" | "cancelled") {
    if (failure) return;
    failure = { ok: false, reason };
    controller.abort();
    resolveStop(failure);
  }
  const cancel = () => {
    stop("cancelled");
  };
  parent?.addEventListener("abort", cancel, { once: true });
  if (parent?.aborted) cancel();
  const timer = setTimeout(
    () => {
      stop("timeout");
    },
    Math.max(1, Math.min(timeoutMs, YAHOO_REQUEST_BUDGET_MS)),
  );
  return {
    get stopped() {
      return failure !== null;
    },
    async run<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<{ ok: true; value: T } | MarketDataFailure> {
      if (failure) return failure;
      return Promise.race([
        Promise.resolve()
          .then(() => operation(controller.signal))
          .then(
            (value) => ({ ok: true as const, value }),
            () => ({ ok: false as const, reason: "provider_unavailable" as const }),
          ),
        stopped,
      ]);
    },
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", cancel);
    },
  };
}
