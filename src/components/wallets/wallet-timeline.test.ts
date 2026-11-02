import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WalletTimeline } from "./WalletTimeline";
import type { WalletSnapshot } from "@/types";
const observation: WalletSnapshot = {
  wallet_id: "w",
  currency: "USD",
  observation_day: "2026-10-27",
  captured_at: "2026-10-27T00:00:00Z",
  starting_value: "1000",
  value: "1140",
  realised_change: "100",
  open_change: "40",
  realised_count: 1,
  open_count: 1,
  not_counted: 2,
  as_of: "2026-10-20",
};
it("renders waiting state without fabricating a point", () => {
  const html = renderToStaticMarkup(createElement(WalletTimeline, { snapshots: [], today: "2026-10-28" }));
  expect(html).toContain("Waiting for the first daily observation");
  expect(html).not.toContain("<circle");
});
it("renders observation details and coverage independently of JavaScript", () => {
  const html = renderToStaticMarkup(
    createElement(WalletTimeline, {
      snapshots: [
        {
          ...observation,
          currency: "USD",
          automatic_count: 1,
          manual_count: 0,
          oldest_market_at: "2026-10-20T12:00:00Z",
        },
      ],
      today: "2026-10-28",
    }),
  );
  for (const text of [
    "USD observations",
    "1,140.00",
    "Realised: 100.00",
    "Open: 40.00",
    "2 excluded",
    "No observation for today yet",
    "Observation data (1)",
    "1 automatic",
    "0 manual open prices",
    "Oldest automatic market time",
    "<table",
  ])
    expect(html).toContain(text);
  expect(html).toContain('role="button" tabindex="0"');
  expect(html).toContain('aria-pressed="true"');
});
it("plots historical USD observations without inventing source coverage", () => {
  const historical = {
    ...observation,
    value: "999999",
    automatic_count: null,
    manual_count: null,
    oldest_market_at: null,
  };
  const html = renderToStaticMarkup(createElement(WalletTimeline, { snapshots: [historical], today: "2026-10-28" }));
  expect(html).toContain("USD observations");
  expect(html).toContain("999,999.00");
  expect(html).toContain("Source coverage is unavailable for this observation.");
  expect(html).not.toContain("0 automatic");
  expect(html).not.toContain("Currency unspecified");
  expect(html).not.toContain("Legacy observation");
  expect(html.match(/role="button" tabindex="0"/g)).toHaveLength(1);
});
