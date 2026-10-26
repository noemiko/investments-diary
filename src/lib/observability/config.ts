import { scrubEvent } from "./privacy";

export function errorReportingOptions(dsn?: string) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: __SENTRY_ENVIRONMENT__,
    release: __SENTRY_RELEASE__,
    sendDefaultPii: false,
    sampleRate: 1,
    enableLogs: false,
    autoSessionTracking: false,
    sendClientReports: false,
    maxBreadcrumbs: 0,
    tracePropagationTargets: [],
    beforeSend: scrubEvent,
  };
}
