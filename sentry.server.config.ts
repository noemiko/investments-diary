import * as Sentry from "@sentry/astro";
import { PUBLIC_SENTRY_DSN } from "astro:env/client";
import { errorReportingOptions } from "./src/lib/observability/config";

Sentry.init({
  ...errorReportingOptions(PUBLIC_SENTRY_DSN),
  integrations: (defaults) =>
    defaults.filter(
      (integration) => !["Console", "CaptureConsole", "LocalVariables", "ProcessSession"].includes(integration.name),
    ),
});
