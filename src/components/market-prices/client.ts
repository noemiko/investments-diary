/** Browser actions only: importing this helper performs no network work. */
export async function priceAction<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("ok" in value) || typeof value.ok !== "boolean") {
    throw new Error("Invalid saved-price response");
  }
  return value as T;
}

/** After an explicit action, refresh read-only SSR fragments without replacing any form. */
export async function refreshPriceFragments(): Promise<void> {
  const response = await fetch(window.location.href, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok || response.redirected) throw new Error("Saved values could not be read");
  const documentCopy = new DOMParser().parseFromString(await response.text(), "text/html");
  const fresh = new Map(
    [...documentCopy.querySelectorAll<HTMLElement>("[data-price-refresh]")].map((element) => [
      element.dataset.priceRefresh,
      element,
    ]),
  );
  const fragments = [...document.querySelectorAll<HTMLElement>("[data-price-refresh]")].filter(
    (element) => !element.querySelector("input, textarea, select, astro-island"),
  );
  if (!fragments.length || fragments.some((element) => !fresh.has(element.dataset.priceRefresh))) {
    throw new Error("Saved values could not be read");
  }
  for (const element of fragments) {
    const replacement = fresh.get(element.dataset.priceRefresh);
    if (replacement) element.replaceWith(document.importNode(replacement, true));
  }
}

export function actionMessage(reason: string, retryAfter?: string | null): string {
  const messages: Record<string, string> = {
    unauthenticated: "Your session expired. Sign in and try again.",
    forbidden: "This action could not be verified. Refresh the page when your other edits are saved.",
    not_found: "This position or saved listing is no longer available.",
    incompatible_currency: "The listing or target wallet uses a different currency. No conversion is available.",
    lookup_expired: "This lookup expired. Click Download prices again before confirming.",
    cooldown: "A previous download failed. Saved prices are still available.",
    refreshing: "Another download is already in progress.",
    timeout: "The provider did not respond in time. Saved prices are still available.",
    provider_unavailable: "The price provider is unavailable. Saved prices are still available.",
    invalid_quote: "The provider did not return a usable quote. Saved prices are still available.",
    invalid_request: "Check the selected listing or wallet and try again.",
    cancelled: "The download was cancelled. Saved prices are still available.",
  };
  const message = messages[reason] ?? "This action could not be completed. Please try again.";
  const date = retryAfter ? new Date(retryAfter) : null;
  return date && Number.isFinite(date.getTime())
    ? `${message} Retry after ${date.toLocaleString()}; retrying is manual.`
    : message;
}

export function marketTimestamp(value: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" }).format(
      new Date(value),
    ) + " UTC"
  );
}
