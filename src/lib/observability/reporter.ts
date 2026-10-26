import * as Sentry from "@sentry/astro";
import { safeCode, safeOperation, safeStatus, safeTags } from "./privacy";

export interface ReportContext {
  operation: string;
  route?: string;
  requestId?: string;
  entityId?: string;
}

/** Keep the original diagnostic chain until the final privacy boundary. */
export function serviceError(operation: string, error: unknown): Error {
  return new Error(`Service failure: ${safeOperation(operation)}`, { cause: error });
}

function diagnosticTags(error: unknown): { code?: string; status?: string } {
  const result: { code?: string; status?: string } = {};
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object" && !seen.has(current); depth++) {
    seen.add(current);
    try {
      result.code ??= "code" in current ? safeCode(current.code) : undefined;
      result.status ??= "status" in current ? safeStatus(current.status) : undefined;
      if (result.code && result.status) return result;
      current = "cause" in current ? current.cause : undefined;
    } catch {
      return result;
    }
  }
  return result;
}

export function reportUnexpected(error: unknown, context: ReportContext): void {
  try {
    const diagnostics = diagnosticTags(error);
    const tags = safeTags({
      ...Sentry.getIsolationScope().getScopeData().tags,
      operation: context.operation,
      ...(context.route ? { route: context.route } : {}),
      ...(context.requestId ? { request_id: context.requestId } : {}),
      ...(context.entityId ? { entity_id: context.entityId } : {}),
      ...diagnostics,
    });
    // Preserve the existing platform-log signal without serializing provider/form data.
    // eslint-disable-next-line no-console
    console.error("Unexpected application failure", tags);
    Sentry.captureException(error, { tags });
  } catch {
    // Telemetry must never change application responses, even if an SDK hook fails.
  }
}
