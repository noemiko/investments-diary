import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthApiError, AuthSessionMissingError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { isUnexpectedAuthError } from "@/lib/observability/auth";
import { reportUnexpected } from "@/lib/observability/reporter";
import { createClient } from "@/lib/supabase";
import { POST as signIn } from "@/pages/api/auth/signin";
import { POST as signUp } from "@/pages/api/auth/signup";
import { POST as signOut } from "@/pages/api/auth/signout";
import { GET as exchangeCode } from "@/pages/auth/callback";
import type { APIContext } from "astro";

vi.mock("@/lib/observability/reporter", () => ({ reportUnexpected: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe("auth error classification", () => {
  it.each(["email_address_invalid", "validation_failed"])(
    "ignores routine %s validation but still reports a server failure with the same code",
    (code) => {
      expect(isUnexpectedAuthError(new AuthApiError("private", 422, code))).toBe(false);
      expect(isUnexpectedAuthError(new AuthApiError("private", 503, code))).toBe(true);
    },
  );
  it.each([
    "invalid_credentials",
    "email_not_confirmed",
    "user_already_exists",
    "signup_disabled",
    "weak_password",
    "flow_state_expired",
    "otp_expired",
    "bad_code_verifier",
    "over_request_rate_limit",
    "session_expired",
  ])("ignores expected %s", (code) => {
    expect(isUnexpectedAuthError(new AuthApiError("private", 400, code))).toBe(false);
  });
  it("ignores a missing session but reports retry, 5xx, and unknown failures regardless of message", () => {
    expect(isUnexpectedAuthError(new AuthSessionMissingError())).toBe(false);
    expect(isUnexpectedAuthError(new AuthRetryableFetchError("private", 0))).toBe(true);
    expect(isUnexpectedAuthError(new AuthApiError("private", 503, "invalid_credentials"))).toBe(true);
    expect(isUnexpectedAuthError(new AuthApiError("Invalid login credentials", 400, "new_provider_failure"))).toBe(
      true,
    );
    expect(isUnexpectedAuthError(new Error("private"))).toBe(true);
  });
});

it.each(["email_address_invalid", "validation_failed"])(
  "signup preserves the %s validation redirect without reporting an incident",
  async (code) => {
    const error = new AuthApiError("Invalid input", 422, code);
    vi.mocked(createClient).mockReturnValue({
      auth: { signUp: vi.fn().mockResolvedValue({ error }) },
    } as unknown as ReturnType<typeof createClient>);
    const request = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: new URLSearchParams({ email: "invalid-address", password: "secret" }),
    });
    const response = await signUp({
      request,
      url: new URL(request.url),
      cookies: {},
      redirect: (location: string) => new Response(null, { status: 302, headers: { location } }),
    } as unknown as APIContext);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/auth/signup?error=Invalid%20input");
    expect(reportUnexpected).not.toHaveBeenCalled();
  },
);

const handlers = [
  {
    handler: signIn,
    method: "POST",
    operation: "auth.signIn",
    path: "/api/auth/signin",
    target: "/auth/signin?error=private",
  },
  {
    handler: signUp,
    method: "POST",
    operation: "auth.signUp",
    path: "/api/auth/signup",
    target: "/auth/signup?error=private",
  },
  { handler: signOut, method: "POST", operation: "auth.signOut", path: "/api/auth/signout", target: "/" },
  {
    handler: exchangeCode,
    method: "GET",
    operation: "auth.exchangeCode",
    path: "/auth/callback?code=secret",
    target: "/auth/signin?error=",
  },
];
it.each(handlers)(
  "$operation reports upstream failures exactly once and preserves redirect",
  async ({ handler, method, operation, path, target }) => {
    const error = new AuthRetryableFetchError("private", 503);
    const result = vi.fn().mockResolvedValue({ error });
    vi.mocked(createClient).mockReturnValue({
      auth: { signInWithPassword: result, signUp: result, signOut: result, exchangeCodeForSession: result },
    } as unknown as ReturnType<typeof createClient>);
    const request = new Request(
      `http://localhost${path}`,
      method === "POST"
        ? { method, body: new URLSearchParams({ email: "private@example.test", password: "secret" }) }
        : undefined,
    );
    const context = {
      request,
      url: new URL(request.url),
      cookies: {},
      redirect: (location: string) => new Response(null, { status: 302, headers: { location } }),
    } as unknown as APIContext;
    const response = await handler(context);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(target);
    expect(reportUnexpected).toHaveBeenCalledExactlyOnceWith(error, { operation });
  },
);
it.each(handlers)("$operation ignores an expected missing-session result", async ({ handler, method, path }) => {
  const result = vi.fn().mockResolvedValue({ error: new AuthSessionMissingError() });
  vi.mocked(createClient).mockReturnValue({
    auth: { signInWithPassword: result, signUp: result, signOut: result, exchangeCodeForSession: result },
  } as unknown as ReturnType<typeof createClient>);
  const request = new Request(
    `http://localhost${path}`,
    method === "POST"
      ? { method, body: new URLSearchParams({ email: "private@example.test", password: "secret" }) }
      : undefined,
  );
  await handler({
    request,
    url: new URL(request.url),
    cookies: {},
    redirect: () => new Response(null, { status: 302 }),
  } as unknown as APIContext);
  expect(reportUnexpected).not.toHaveBeenCalled();
});
