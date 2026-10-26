import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { getIsolationScope, init } from "@sentry/astro";
import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { onRequest } from "@/middleware";
import { reportUnexpected } from "@/lib/observability/reporter";
vi.mock("../../../sentry.server.config", () => ({}));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/observability/reporter", () => ({ reportUnexpected: vi.fn() }));
beforeAll(() => {
  init({ dsn: undefined, defaultIntegrations: false });
});
beforeEach(() => vi.resetAllMocks());
function context(route: string): APIContext {
  return {
    request: new Request(`http://localhost${route}?private=secret`),
    url: new URL(`http://localhost${route}`),
    routePattern: route,
    cookies: {},
    locals: { user: null },
    redirect: (location: string) => new Response(null, { status: 302, headers: { location } }),
  } as unknown as APIContext;
}
it("reports getUser failure and preserves the protected redirect", async () => {
  const error = new AuthRetryableFetchError("private", 503);
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error }) },
  } as unknown as ReturnType<typeof createClient>);
  const next = vi.fn();
  const response = await onRequest(context("/dashboard"), next);
  if (!(response instanceof Response)) throw new Error("Expected middleware response");
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/auth/signin");
  expect(next).not.toHaveBeenCalled();
  expect(reportUnexpected).toHaveBeenCalledExactlyOnceWith(error, { operation: "auth.getUser" });
});
it("keeps concurrent request scopes separate across asynchronous auth and handlers", async () => {
  let release: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = 0;
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getUser: async () => {
        entered++;
        if (entered === 2) release?.();
        await barrier;
        return { data: { user: null }, error: new AuthSessionMissingError() };
      },
    },
  } as unknown as ReturnType<typeof createClient>);
  const before = getIsolationScope().getScopeData().tags;
  const seen: Record<string, unknown>[] = [];
  await Promise.all(
    ["/auth/signin", "/auth/signup"].map(
      async (route) =>
        await onRequest(context(route), async () => {
          await Promise.resolve();
          seen.push({ ...getIsolationScope().getScopeData().tags });
          return new Response("ok");
        }),
    ),
  );
  expect(seen.map((tags) => tags.route).sort()).toEqual(["/auth/signin", "/auth/signup"]);
  expect(seen[0]?.request_id).toMatch(/^[\da-f-]{36}$/);
  expect(seen[0]?.request_id).not.toBe(seen[1]?.request_id);
  expect(getIsolationScope().getScopeData().tags).toEqual(before);
  expect(reportUnexpected).not.toHaveBeenCalled();
});
