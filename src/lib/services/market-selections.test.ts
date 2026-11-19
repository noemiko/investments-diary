import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { ApiDatabase } from "@/db/api.types";
import { reportUnexpected } from "@/lib/observability/reporter";
import type { MarketDataProvider } from "./market-prices";
import { searchMarketSelections } from "./market-selections";

vi.mock("@/lib/observability/reporter", () => ({ reportUnexpected: vi.fn() }));

const walletId = "b8181cb8-2d6b-4dd4-99a4-f59fc01225f2";
const client = createClient<ApiDatabase>("http://localhost:54321", "test-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: () => Promise.resolve(new Response(JSON.stringify({ id: walletId }))),
  },
});
const provider: MarketDataProvider = {
  searchListings: vi.fn<MarketDataProvider["searchListings"]>(),
  confirmListing: vi.fn<MarketDataProvider["confirmListing"]>(),
  fetchQuotes: vi.fn<MarketDataProvider["fetchQuotes"]>(),
};

beforeEach(() => vi.clearAllMocks());

it("keeps the search status and reason without sending the search query or retry timestamp to the reporter", async () => {
  const failure = {
    ok: false,
    reason: "provider_unavailable",
    status: 503,
    retryAfter: "2026-11-19T15:00:00Z",
  } as const;
  vi.mocked(provider.searchListings).mockResolvedValueOnce(failure);
  await expect(searchMarketSelections(client, "owner", walletId, "PRIVATE_QUERY", undefined, provider)).resolves.toBe(
    failure,
  );
  expect(reportUnexpected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 503 }), {
    operation: "marketPrices",
    market: { stage: "listing_search", reason: "provider_unavailable" },
  });
  expect(JSON.stringify(vi.mocked(reportUnexpected).mock.calls)).not.toMatch(/PRIVATE_QUERY|retryAfter/);
});

it.each(["cancelled", "not_found"] as const)("keeps expected search outcome %s quiet", async (reason) => {
  const failure = { ok: false, reason } as const;
  vi.mocked(provider.searchListings).mockResolvedValueOnce(failure);
  await expect(searchMarketSelections(client, "owner", walletId, "PRIVATE_QUERY", undefined, provider)).resolves.toBe(
    failure,
  );
  expect(reportUnexpected).not.toHaveBeenCalled();
});
