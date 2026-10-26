import { afterEach, expect, it, vi } from "vitest";
import { errorReportingOptions } from "./config";
import { scrubEvent } from "./privacy";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("disables delivery without a DSN and configures error-only metadata with a DSN", () => {
  vi.stubGlobal("__SENTRY_RELEASE__", "test-commit");
  vi.stubGlobal("__SENTRY_ENVIRONMENT__", "preview");
  expect(errorReportingOptions().enabled).toBe(false);
  expect(errorReportingOptions("http://public@localhost:9000/1")).toMatchObject({
    enabled: true,
    sampleRate: 1,
    enableLogs: false,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    tracePropagationTargets: [],
    beforeSend: scrubEvent,
  });
});
