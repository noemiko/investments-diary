import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DownloadPrices } from "./DownloadPrices";
import { ListingControl } from "./ListingControl";
import { MovePositionControl } from "./MovePositionControl";
import { actionMessage } from "./client";
import type { Wallet } from "@/types";

afterEach(() => {
  vi.restoreAllMocks();
});
it("renders explicit download and search controls without starting provider work", () => {
  const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unexpected network request"));
  const dashboard = renderToStaticMarkup(createElement(DownloadPrices, { enabled: true }));
  const detail = renderToStaticMarkup(
    createElement(ListingControl, { positionId: "position", currency: "USD", initialListing: null }),
  );
  expect(dashboard).toContain("Download prices");
  expect(dashboard).toContain("Opening or reloading a page uses saved prices");
  expect(detail).toContain("Search listings");
  expect(detail).toContain("Quotes require Download prices");
  expect(detail).not.toContain("Confirm listing:");
  expect(network).not.toHaveBeenCalled();
});
it("shows a saved search selection on detail without claiming it is an unlinked or verified quote", () => {
  const network = vi.spyOn(globalThis, "fetch");
  const detail = renderToStaticMarkup(
    createElement(ListingControl, {
      positionId: "position",
      currency: "USD",
      initialListing: null,
      initialSelection: {
        symbol: "AAPL",
        name: "Apple",
        exchange: "NMS",
        exchangeName: "Nasdaq",
        instrumentType: "EQUITY",
      },
    }),
  );
  expect(detail).toContain("Selected:");
  expect(detail).toContain("AAPL");
  expect(detail).toContain("Download prices on the dashboard");
  expect(detail).not.toContain("No listing linked");
  expect(network).not.toHaveBeenCalled();
});
it("offers compatible target wallets without currency setup or attestation", () => {
  const wallets: Wallet[] = [
    { id: "current", name: "Current", currency: "USD", starting_value: "0" },
    { id: "compatible", name: "Compatible", currency: "USD", starting_value: "0" },
    { id: "foreign-currency", name: "Different", currency: "PLN", starting_value: "0" },
  ];
  const html = renderToStaticMarkup(
    createElement(MovePositionControl, { positionId: "position", walletId: "current", sourceCurrency: "USD", wallets }),
  );
  expect(html).toContain("Compatible");
  expect(html).not.toContain('value="foreign-currency"');
  expect(html).not.toContain('type="checkbox"');
  expect(html).not.toContain("confirm a target wallet");
});
it("explains retry cooldowns without exposing raw provider failures", () => {
  expect(actionMessage("timeout", "2026-10-30T13:00:00Z")).toContain("retrying is manual");
  expect(actionMessage("incompatible_currency")).toContain("different currency");
  expect(actionMessage("PRIVATE_PROVIDER_PAYLOAD")).not.toContain("PRIVATE_PROVIDER_PAYLOAD");
});
