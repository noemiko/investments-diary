import * as Sentry from "@sentry/astro";
import { PUBLIC_SENTRY_DSN } from "astro:env/client";
import { errorReportingOptions } from "./src/lib/observability/config";

Sentry.init({
  ...errorReportingOptions(PUBLIC_SENTRY_DSN),
  integrations: (defaults) =>
    defaults.filter(
      (integration) =>
        !["Breadcrumbs", "BrowserSession", "BrowserTracing", "Replay", "CaptureConsole", "Console"].includes(
          integration.name,
        ),
    ),
});
