import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import PriceContext from "./PriceContext.astro";
import type { MarketListingCandidate, PositionValuation } from "@/types";
const valuation: PositionValuation = {
  source: "manual_override",
  currency: "USD",
  selectedAt: "2026-10-30T12:00:00Z",
  marketAt: "2026-10-29T20:00:00Z",
  fetchedAt: "2026-10-30T11:00:00Z",
  quoteState: "cooldown",
  refreshOutcome: "timeout",
  cooldownUntil: "2026-10-30T12:15:00Z",
  manualSavedAt: "2026-10-30T12:00:00Z",
  manualPrice: "12",
  manualPriceDate: "2026-10-30",
  listing: null,
  marketState: "CLOSED",
  delayMinutes: 15,
};
it("shows actual market time, source, temporary override and retained-quote failure state", async () => {
  const html = (await (await AstroContainer.create()).renderToString(PriceContext, { props: { valuation } })).replace(
    /<!--[\s\S]*?-->/g,
    "",
  );
  for (const text of [
    "Temporary manual correction",
    "USD",
    "strictly later",
    "Saved quote market time",
    "CLOSED",
    "Provider-reported delay 15 min",
    "Latest download failed.",
    "The provider did not respond in time",
    "Retry after",
  ])
    expect(html).toContain(text);
});
it("closed sales do not imply quote freshness or a failed valuation", async () => {
  const html = await (
    await AstroContainer.create()
  ).renderToString(PriceContext, { props: { valuation: { ...valuation, source: "sale" } } });
  expect(html).toContain("Recorded sale");
  expect(html).not.toContain("Saved quote market time");
  expect(html).not.toContain("Latest download failed");
});

it("describes an older quote without exposing the refresh outcome code", async () => {
  const html = await (
    await AstroContainer.create()
  ).renderToString(PriceContext, { props: { valuation: { ...valuation, refreshOutcome: "older_quote" } } });
  expect(html).toContain("An older quote was ignored");
  expect(html).not.toContain("older_quote");
});

it("distinguishes a saved search selection from a currency-checked downloaded listing", async () => {
  const html = await (
    await AstroContainer.create()
  ).renderToString(PriceContext, {
    props: {
      valuation: {
        ...valuation,
        source: "missing",
        marketAt: null,
        refreshOutcome: null,
        cooldownUntil: null,
        pendingSelection: {
          symbol: "AAPL",
          name: "Apple",
          exchange: "NMS",
          exchangeName: "Nasdaq",
          instrumentType: "EQUITY",
        },
      },
    },
  });
  expect(html).toContain("Selected: AAPL");
  expect(html).toContain("Trading currency is not checked yet");
  expect(html).toContain("Click Download prices on the dashboard");
  expect(html).not.toContain("Saved quote market time");
});

it("retains a verified pending currency mismatch without claiming it is unchecked", async () => {
  const html = await (
    await AstroContainer.create()
  ).renderToString(PriceContext, {
    props: {
      valuation: {
        ...valuation,
        source: "missing",
        marketAt: null,
        refreshOutcome: null,
        cooldownUntil: null,
        pendingCurrency: "PLN",
        pendingSelection: {
          symbol: "PKN.WA",
          name: "Orlen",
          exchange: "WSE",
          exchangeName: "Warsaw",
          instrumentType: "EQUITY",
        },
      },
    },
  });
  const plain = html.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ");
  expect(plain).toContain("This listing trades in PLN, but the wallet uses USD");
  expect(plain).toContain("Its quote is not applied");
  expect(plain).not.toContain("Trading currency is not checked yet");
});

describe("compact variant", () => {
  const healthy: PositionValuation = {
    ...valuation,
    source: "automatic",
    quoteState: "fresh",
    refreshOutcome: "success",
    cooldownUntil: null,
    manualSavedAt: null,
    listing: {
      symbol: "AAPL",
      name: "Apple",
      exchange: "NMS",
      exchangeName: "Nasdaq",
      instrumentType: "EQUITY",
      currency: "USD",
      timezone: "America/New_York",
    },
  };
  const pendingSelection: MarketListingCandidate = {
    symbol: "AAPL",
    name: "Apple",
    exchange: "NMS",
    exchangeName: "Nasdaq",
    instrumentType: "EQUITY",
  };
  async function compact(value: PositionValuation) {
    const html = await (
      await AstroContainer.create()
    ).renderToString(PriceContext, { props: { valuation: value, variant: "compact" } });
    const plain = (fragment: string) =>
      fragment
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const notices = [...html.matchAll(/<p\b[^>]*data-price-notice[^>]*>([\s\S]*?)<\/p>/g)].map(([, inner]) =>
      plain(inner),
    );
    return { text: plain(html), notices };
  }

  it.each([
    ["sale", "Sale"],
    ["manual_override", "Manual correction"],
    ["automatic", "Downloaded"],
    ["manual", "Manual"],
    ["missing", "No price"],
  ] as const)("labels the %s source in one short line", async (source, label) => {
    const { text } = await compact({ ...healthy, source });
    expect(text.startsWith(label)).toBe(true);
    // None of the full variant's provenance lines.
    expect(text).not.toContain("Saved quote market time");
    expect(text).not.toContain("strictly later");
    expect(text).not.toContain("Nasdaq");
  });

  it.each(["automatic", "manual", "manual_override", "sale"] as const)(
    "shows no notice for a healthy %s price",
    async (source) => {
      expect((await compact({ ...healthy, source })).notices).toEqual([]);
    },
  );

  it.each([
    [
      "currency not checked yet",
      { ...healthy, source: "missing", listing: null, refreshOutcome: null, pendingSelection },
      "Trading currency is not checked yet. Click Download prices to check it.",
    ],
    [
      "currency mismatch",
      { ...healthy, source: "missing", listing: null, refreshOutcome: null, pendingSelection, pendingCurrency: "PLN" },
      "Currency mismatch: this listing trades in PLN, but the wallet uses USD.",
    ],
    [
      "latest download failed",
      { ...healthy, quoteState: "cooldown", refreshOutcome: "timeout", cooldownUntil: "2026-10-30T12:15:00Z" },
      "Latest download failed. The provider did not respond in time. Saved prices are still available.",
    ],
    [
      "download in progress",
      { ...healthy, quoteState: "refreshing" },
      "A download is in progress; saved values are shown.",
    ],
    [
      "no price",
      { ...healthy, source: "missing", listing: null, refreshOutcome: null },
      "No price saved. Download prices or enter one on the detail page.",
    ],
  ] satisfies [string, PositionValuation, string][])("shows exactly one notice when %s", async (_, value, notice) => {
    expect((await compact(value)).notices).toEqual([notice]);
  });

  it("never warns about a recorded sale, even with a failed download", async () => {
    expect((await compact({ ...healthy, source: "sale", refreshOutcome: "timeout" })).notices).toEqual([]);
  });

  it("keeps an ignored older quote quiet: the last usable price is retained", async () => {
    expect((await compact({ ...healthy, refreshOutcome: "older_quote" })).notices).toEqual([]);
  });

  it("keeps the full variant as the default", async () => {
    const html = await (await AstroContainer.create()).renderToString(PriceContext, { props: { valuation } });
    expect(html).toContain("Temporary manual correction");
    expect(html).not.toContain("data-price-notice");
  });
});
