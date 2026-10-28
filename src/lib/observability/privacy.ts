import type { ErrorEvent, Event, StackFrame } from "@sentry/astro";

const OPERATIONS = new Set([
  "listPositions",
  "listCategories",
  "listWallets",
  "listWalletPositions",
  "listConfrontationPositions",
  "listDeletedPositions",
  "getPosition",
  "getWallet",
  "loadWallets",
  "createPosition",
  "updatePositionPrice",
  "closePosition",
  "deletePosition",
  "restorePosition",
  "findOrCreateCategory",
  "createWallet",
  "updateWallet",
  "auth.getUser",
  "auth.signIn",
  "auth.signUp",
  "auth.signOut",
  "auth.exchangeCode",
]);
const ERROR_TYPES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "AggregateError",
  "AuthError",
  "AuthApiError",
  "AuthRetryableFetchError",
  "PostgrestError",
  "ServiceError",
]);
const PROVIDER_CODES = new Set([
  "XX000",
  "08006",
  "08001",
  "23505",
  "23503",
  "23514",
  "42501",
  "PGRST116",
  "PGRST301",
  "PGRST205",
  "unexpected_failure",
  "database_error",
  "request_timeout",
  "over_request_rate_limit",
  "unknown",
]);
const ROUTES = new Set([
  "/",
  "/dashboard",
  "/dashboard/new",
  "/dashboard/deleted",
  "/dashboard/wallets",
  "/dashboard/wallets/new",
  "/dashboard/wallets/[id]",
  "/dashboard/positions/[id]",
  "/dashboard/positions/[id]/delete",
  "/dashboard/positions/[id]/restore",
  "/dashboard/positions/not-found",
  "/auth/signin",
  "/auth/signup",
  "/auth/callback",
  "/auth/confirm-email",
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/signout",
  "/dev/kitchen-sink",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeOperation(value: unknown): string {
  return typeof value === "string" && OPERATIONS.has(value) ? value : "unexpected";
}

export function safeCode(value: unknown): string | undefined {
  return typeof value === "string" && PROVIDER_CODES.has(value) ? value : undefined;
}

export function safeStatus(value: unknown): string | undefined {
  const status = typeof value === "number" ? String(value) : value;
  return typeof status === "string" && /^(?:0|[45]\d{2})$/.test(status) ? status : undefined;
}

export function safeTags(tags: Event["tags"]): Record<string, string> {
  const result: Record<string, string> = { operation: safeOperation(tags?.operation) };
  for (const key of ["request_id", "entity_id"] as const) {
    const value = tags?.[key];
    if (typeof value === "string" && UUID.test(value)) result[key] = value;
  }
  const route = tags?.route;
  // Only route patterns, never user-provided path components or search parameters.
  if (typeof route === "string" && ROUTES.has(route)) {
    result.route = route;
  }
  const code = safeCode(tags?.code);
  if (code) result.code = code;
  const status = safeStatus(tags?.status);
  if (status) result.status = status;
  return result;
}

function safeFilename(value: string | undefined): string | undefined {
  if (!value || value.length > 1000) return undefined;
  const clean = value.split(/[?#]/, 1)[0];
  // Local build paths can include an account name; keep only source-relative locations.
  const source = /(?:^|\/)((?:src|node_modules|_astro|dist\/server)\/[^?#]*\.(?:[cm]?js|tsx?|astro))$/.exec(clean)?.[1];
  if (source) return source;
  return clean === "<anonymous>" ? clean : undefined;
}

function safeFrame(frame: StackFrame): StackFrame {
  return {
    filename: safeFilename(frame.filename),
    function: frame.function && /^[\w.$<> ]{1,120}$/.test(frame.function) ? frame.function : undefined,
    lineno: frame.lineno,
    colno: frame.colno,
    in_app: frame.in_app,
  };
}

/** Rebuild rather than redact: new SDK/provider fields are private by default. */
export function scrubEvent(event: Event): ErrorEvent {
  const tags = safeTags(event.tags);
  const message = `Unexpected application failure: ${tags.operation}`;
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: "error",
    release: event.release,
    environment: ["production", "preview", "development"].includes(event.environment ?? "")
      ? event.environment
      : "development",
    message,
    tags,
    debug_meta: event.debug_meta
      ? {
          images: event.debug_meta.images?.flatMap((image) =>
            image.type === "sourcemap" && image.debug_id && UUID.test(image.debug_id)
              ? [
                  {
                    type: "sourcemap" as const,
                    debug_id: image.debug_id,
                    code_file: safeFilename(image.code_file) ?? "<anonymous>",
                  },
                ]
              : [],
          ),
        }
      : undefined,
    exception: event.exception
      ? {
          values: event.exception.values?.slice(0, 5).map((exception) => ({
            type: ERROR_TYPES.has(exception.type ?? "") ? exception.type : "Error",
            value: message,
            mechanism: exception.mechanism ? { type: "generic", handled: exception.mechanism.handled } : undefined,
            stacktrace: exception.stacktrace
              ? { frames: exception.stacktrace.frames?.slice(-50).map(safeFrame) }
              : undefined,
          })),
        }
      : undefined,
  };
}
