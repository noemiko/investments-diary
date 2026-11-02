import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, it } from "vitest";
import PriceContext from "./PriceContext.astro";
import type { PositionValuation } from "@/types";
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
