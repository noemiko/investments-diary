import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DownloadPrices } from "./DownloadPrices";
import { MovePositionControl } from "./MovePositionControl";
import { actionMessage } from "./client";
import type { Wallet } from "@/types";

afterEach(() => {
  vi.restoreAllMocks();
});
it("renders the explicit download control without starting provider work or pointing at listing setup", () => {
  const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unexpected network request"));
  for (const enabled of [true, false]) {
    const dashboard = renderToStaticMarkup(createElement(DownloadPrices, { enabled }));
    expect(dashboard).toContain("Download prices");
    expect(dashboard).toContain("Opening or reloading a page uses saved prices");
    expect(dashboard).not.toContain("Link stock listing");
  }
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
