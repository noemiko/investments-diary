import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { reportAuthError } from "@/lib/observability/auth";
import { POST } from "@/pages/api/auth/signin";
import { GET as callback } from "@/pages/auth/callback";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/observability/auth", () => ({ reportAuthError: vi.fn() }));
const signIn = vi.fn();
const exchange = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createClient).mockReturnValue({
    auth: { signInWithPassword: signIn, exchangeCodeForSession: exchange },
  } as unknown as ReturnType<typeof createClient>);
  signIn.mockResolvedValue({ error: null });
  exchange.mockResolvedValue({ error: null });
});
function context(
  body: BodyInit = new URLSearchParams({
    email: "investor@example.test",
    password: " secret ",
    returnTo: "/dashboard/wallets?range=30",
  }),
  headers?: HeadersInit,
): APIContext {
  return {
    request: new Request("http://localhost/api/auth/signin", { method: "POST", body, headers }),
    cookies: {},
    redirect: (location: string) => new Response(null, { status: 302, headers: { location } }),
  } as unknown as APIContext;
}

describe("native signin endpoint", () => {
  it("passes normalized email and unchanged password to Supabase and restores nested destination", async () => {
    const result = await POST(
      context(
        new URLSearchParams({
          email: " investor@example.test ",
          password: " secret ",
          returnTo: "/dashboard/wallets?range=30#remove",
        }),
      ),
    );
    expect(signIn).toHaveBeenCalledExactlyOnceWith({ email: "investor@example.test", password: " secret " });
    expect(result.headers.get("location")).toBe("/dashboard/wallets?range=30");
  });
  it.each([new URLSearchParams({ email: "bad", password: "secret" }), "malformed body"])(
    "rejects invalid input before creating provider client",
    async (body) => {
      const result = await POST(context(body));
      expect(result.headers.get("location")).toContain("error=invalid_input");
      expect(createClient).not.toHaveBeenCalled();
    },
  );
  it("revalidates forged return destinations on successful authentication", async () => {
    const result = await POST(
      context(new URLSearchParams({ email: "investor@example.test", password: "secret", returnTo: "//evil.test" })),
    );
    expect(result.headers.get("location")).toBe("/dashboard");
  });
  it.each(["invalid_credentials", "email_not_confirmed"])("hides provider account-state %s", async (code) => {
    signIn.mockResolvedValue({ error: new AuthApiError("private account detail", 400, code) });
    const result = await POST(context());
    const location = new URL(result.headers.get("location") ?? "", "http://localhost");
    expect(location.searchParams.get("error")).toBe("signin_failed");
    expect(location.searchParams.get("returnTo")).toBe("/dashboard/wallets?range=30");
    expect(location.href).not.toContain("private");
  });
  it("revalidates forged return destinations after failed authentication", async () => {
    signIn.mockResolvedValue({ error: new AuthApiError("private", 400, "invalid_credentials") });
    const result = await POST(
      context(new URLSearchParams({ email: "investor@example.test", password: "secret", returnTo: "//evil.test" })),
    );
    const location = new URL(result.headers.get("location") ?? "", "http://localhost");
    expect(location.searchParams.get("returnTo")).toBe("/dashboard");
    expect(location.searchParams.get("error")).toBe("signin_failed");
  });
  it("reports thrown failures without exposing details", async () => {
    const failure = new Error("private");
    signIn.mockRejectedValue(failure);
    const result = await POST(context());
    expect(result.headers.get("location")).toContain("error=signin_failed");
    expect(reportAuthError).toHaveBeenCalledExactlyOnceWith(failure, "auth.signIn");
  });
});

describe("email callback", () => {
  function callbackContext(search: string): APIContext {
    return { ...context(), url: new URL(`http://localhost/auth/callback${search}`) } as APIContext;
  }
  it("uses the fixed code without exchanging an absent code", async () => {
    expect((await callback(callbackContext("?error=private"))).headers.get("location")).toBe(
      "/auth/signin?error=link_failed",
    );
    expect(exchange).not.toHaveBeenCalled();
  });
  it("preserves the successful callback destination", async () => {
    expect((await callback(callbackContext("?code=local-test"))).headers.get("location")).toBe("/dashboard");
    expect(exchange).toHaveBeenCalledExactlyOnceWith("local-test");
  });
  it("reports thrown callback failures and returns only the fixed error", async () => {
    const error = new Error("private provider detail");
    exchange.mockRejectedValue(error);
    expect((await callback(callbackContext("?code=local-test"))).headers.get("location")).toBe(
      "/auth/signin?error=link_failed",
    );
    expect(reportAuthError).toHaveBeenCalledExactlyOnceWith(error, "auth.exchangeCode");
  });
  it("uses the same fixed error for a rejected link", async () => {
    exchange.mockResolvedValue({ error: new AuthApiError("private", 400, "otp_expired") });
    expect((await callback(callbackContext("?code=local-test"))).headers.get("location")).toBe(
      "/auth/signin?error=link_failed",
    );
  });
});
