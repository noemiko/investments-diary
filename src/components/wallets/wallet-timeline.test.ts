import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WalletTimeline } from "./WalletTimeline";
import type { WalletSnapshot } from "@/types";
it("renders waiting state and accessible SSR controls without fabricating a point", () => {
  const html = renderToStaticMarkup(createElement(WalletTimeline, { snapshots: [], today: "2026-10-28" }));
  expect(html).toContain("Waiting for the first daily observation");
  expect(html).not.toContain("<circle");
  expect(html).toContain('aria-pressed="true"');
});
it("renders observation details and table independently of JavaScript", () => {
  const p: WalletSnapshot = {
    wallet_id: "w",
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
  const html = renderToStaticMarkup(createElement(WalletTimeline, { snapshots: [p], today: "2026-10-28" }));
  for (const text of [
    "1,140.00",
    "Realised: 100.00",
    "Open: 40.00",
    "2 excluded",
    "No observation for today yet",
    "Observation data (1)",
    "<table",
  ])
    expect(html).toContain(text);
  expect(html).toContain('role="button" tabindex="0"');
});
