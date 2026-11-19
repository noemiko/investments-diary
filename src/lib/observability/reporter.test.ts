import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/astro";
import { reportUnexpected, serviceError } from "./reporter";

vi.mock("@sentry/astro", async (importOriginal) => {
  const original = await importOriginal<typeof import("@sentry/astro")>();
  return { ...original, captureException: vi.fn() };
});

beforeAll(() => {
  Sentry.init({ defaultIntegrations: false, dsn: undefined });
});
beforeEach(() => {
  vi.mocked(Sentry.captureException).mockReset().mockReturnValue("event");
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("nonthrowing reporter", () => {
  it.each([0, 503])("retains HTTP/network status %s through wrapped causes", (status) => {
    const capture = vi.mocked(Sentry.captureException);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = serviceError("auth.getUser", { status, message: "PRIVATE_SENTINEL" });
    reportUnexpected(error, { operation: "auth.getUser" });
    expect(capture).toHaveBeenCalledExactlyOnceWith(error, {
      tags: { operation: "auth.getUser", status: String(status) },
    });
  });
  it("retains a safe provider code through wrapped causes without leaking the provider message", () => {
    const capture = vi.mocked(Sentry.captureException).mockReturnValue("event");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = serviceError("listPositions", { code: "XX000", message: "PRIVATE_SENTINEL" });
    reportUnexpected(error, { operation: "listPositions" });
    expect(capture).toHaveBeenCalledExactlyOnceWith(error, { tags: { operation: "listPositions", code: "XX000" } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_SENTINEL");
  });
  it("passes the original exception for stack/cause parsing while logging only safe context", () => {
    const capture = vi.mocked(Sentry.captureException).mockReturnValue("event");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = new Error("PRIVATE_SENTINEL");
    const error = serviceError("listPositions", original);
    reportUnexpected(error, { operation: "listPositions", route: "/dashboard" });
    expect(error.cause).toBe(original);
    expect(capture).toHaveBeenCalledExactlyOnceWith(error, {
      tags: { operation: "listPositions", route: "/dashboard" },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_SENTINEL");
  });

  it("emits identical bounded market tags to logs and capture", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("Market data operation failed"), { status: 429, query: "PRIVATE_SENTINEL" });
    reportUnexpected(error, {
      operation: "marketPrices",
      market: { stage: "quote_batch", reason: "provider_unavailable", affectedCount: 2 },
    });
    const tags = {
      operation: "marketPrices",
      provider: "yahoo",
      provider_stage: "quote_batch",
      provider_reason: "provider_unavailable",
      affected_count: "2",
      status: "429",
    };
    expect(log).toHaveBeenCalledExactlyOnceWith("Unexpected application failure", tags);
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error, { tags });
  });

  it("contains SDK failures and hostile exception getters", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(Sentry.captureException).mockImplementation(() => {
      throw new Error("transport unavailable");
    });
    expect(() => {
      reportUnexpected(new Error("failure"), { operation: "listPositions" });
    }).not.toThrow();
    const hostile = Object.defineProperty({}, "code", {
      get() {
        throw new Error("hostile getter");
      },
    });
    expect(() => {
      reportUnexpected(hostile, { operation: "listPositions" });
    }).not.toThrow();
  });

  it("inherits current request metadata without attaching another request's metadata", () => {
    const capture = vi.mocked(Sentry.captureException).mockReturnValue("event");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    Sentry.withIsolationScope((scope) => {
      scope.setTag("request_id", "b8181cb8-2d6b-4dd4-99a4-f59fc01225f2");
      reportUnexpected(new Error(), { operation: "getPosition" });
    });
    Sentry.withIsolationScope(() => {
      reportUnexpected(new Error(), { operation: "getWallet" });
    });
    expect(capture.mock.calls[0][1]).toMatchObject({ tags: { request_id: "b8181cb8-2d6b-4dd4-99a4-f59fc01225f2" } });
    expect(capture.mock.calls[1][1]).toEqual({ tags: { operation: "getWallet" } });
  });
});
