import { describe, expect, it } from "vitest";
import type { Event } from "@sentry/astro";
import { safeStatus, scrubEvent } from "./privacy";

describe("final event privacy boundary", () => {
  it.each(["PRIVATE_SENTINEL", 200, 399, 600, 503.5, "503PRIVATE_SENTINEL"])("rejects unsafe status %s", (status) => {
    expect(safeStatus(status)).toBeUndefined();
  });
  it.each(["0", "400", "503", "599"])("preserves safe status %s in final events", (status) => {
    expect(scrubEvent({ tags: { status } }).tags).toMatchObject({ status });
  });
  it("rebuilds automatic and explicit exceptions without private data, retaining useful source frames", () => {
    const secret = "PRIVATE_SENTINEL";
    const event: Event = {
      event_id: "abc",
      release: "commit",
      environment: "preview",
      message: secret,
      transaction: secret,
      fingerprint: [secret],
      user: { email: secret },
      request: { url: `https://app.test/?email=${secret}`, cookies: { session: secret } },
      extra: { form: secret },
      contexts: { database: { details: secret } },
      breadcrumbs: [{ message: secret }],
      tags: {
        operation: "listPositions",
        code: "23505",
        email: secret,
        route: "/dashboard/positions/[id]",
        request_id: "b8181cb8-2d6b-4dd4-99a4-f59fc01225f2",
      },
      exception: {
        values: [
          {
            type: "Error",
            value: secret,
            stacktrace: {
              frames: [
                {
                  filename: `https://app.test/_astro/page.js?token=${secret}#${secret}`,
                  function: "loadPage",
                  lineno: 4,
                  colno: 8,
                  vars: { secret },
                  context_line: secret,
                },
              ],
            },
          },
          { type: secret, value: secret },
        ],
      },
      debug_meta: {
        images: [
          {
            type: "sourcemap",
            code_file: `https://app.test/_astro/page.js?${secret}`,
            debug_id: "b8181cb8-2d6b-4dd4-99a4-f59fc01225f2",
          },
        ],
      },
    };
    const result = scrubEvent(event);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.tags).toMatchObject({
      operation: "listPositions",
      code: "23505",
      route: "/dashboard/positions/[id]",
    });
    expect(result.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({
      filename: "_astro/page.js",
      function: "loadPage",
      lineno: 4,
      colno: 8,
    });
    expect(result.exception?.values?.[1].type).toBe("Error");
    expect(result.debug_meta?.images?.[0].debug_id).toBe("b8181cb8-2d6b-4dd4-99a4-f59fc01225f2");
    expect(result).toMatchObject({ release: "commit", environment: "preview" });
  });

  it("keeps matching production server frame and debug image locations, dropping arbitrary document URLs", () => {
    const path = "/var/task/project/dist/server/chunks/entry_abc.mjs?token=secret";
    const result = scrubEvent({
      exception: {
        values: [
          {
            type: "Error",
            mechanism: { type: "auto.middleware", handled: false },
            stacktrace: { frames: [{ filename: path }, { filename: "https://app.test/private-position" }] },
          },
        ],
      },
      debug_meta: {
        images: [{ type: "sourcemap", code_file: path, debug_id: "b8181cb8-2d6b-4dd4-99a4-f59fc01225f2" }],
      },
    });
    expect(result.exception?.values?.[0].stacktrace?.frames?.[0].filename).toBe("dist/server/chunks/entry_abc.mjs");
    expect(result.debug_meta?.images?.[0].code_file).toBe("dist/server/chunks/entry_abc.mjs");
    expect(result.exception?.values?.[0].stacktrace?.frames?.[1].filename).toBeUndefined();
    expect(result.exception?.values?.[0].mechanism).toEqual({ type: "generic", handled: false });
  });

  it("rejects untrusted operation, code, correlation fields and real request URLs", () => {
    const result = scrubEvent({
      tags: {
        operation: "private-position-name",
        code: "private-provider-code",
        request_id: "email@example.test",
        entity_id: "email@example.test",
        route: "/private-investment-name",
      },
    });
    expect(result.tags).toEqual({ operation: "unexpected" });
    expect(result.message).toBe("Unexpected application failure: unexpected");
  });
});

it("retains the close operation while removing all financial submission data", () => {
  const result = scrubEvent({
    message: "sale 12345.67891234 on 2026-09-15 failed",
    tags: { operation: "closePosition", code: "XX000", sell_price: "12345.67891234", sell_date: "2026-09-15" },
    extra: { form: { sell_price: "12345.67891234", sell_date: "2026-09-15", acknowledgement: "on" } },
    request: { data: "sell_price=12345.67891234&sell_date=2026-09-15" },
    exception: { values: [{ type: "PostgrestError", value: "sale 12345.67891234 failed" }] },
  });
  expect(result.tags).toEqual({ operation: "closePosition", code: "XX000" });
  expect(result.message).toBe("Unexpected application failure: closePosition");
  expect(JSON.stringify(result)).not.toContain("12345.67891234");
  expect(JSON.stringify(result)).not.toContain("2026-09-15");
  expect(result.request).toBeUndefined();
  expect(result.extra).toBeUndefined();
});
