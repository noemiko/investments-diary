import { describe, expect, it } from "vitest";
import { safeReturnTo, signInLocation } from "@/lib/auth-return";

describe("dashboard return destinations", () => {
  it.each(["/dashboard", "/dashboard/", "/dashboard/wallets?range=90&sort=name", "/dashboard/positions/abc"])(
    "keeps safe destination %s",
    (value) => {
      expect(safeReturnTo(value)).toBe(value);
    },
  );
  it("discards fragments and normalizes internal dot segments", () => {
    expect(safeReturnTo("/dashboard/wallets?range=30#private")).toBe("/dashboard/wallets?range=30");
    expect(safeReturnTo("/dashboard/wallets/../new")).toBe("/dashboard/new");
  });
  it.each([
    null,
    undefined,
    "",
    "dashboard",
    "https://example.test/dashboard",
    "//example.test/dashboard",
    "/dashboard-other",
    "/auth/signin",
    "/dashboard/../../auth/signin",
    "/dashboard/\\evil",
    "/dashboard/\nfoo",
    "/dashboard/%2e%2e/auth",
    "/dashboard/%252e%252e/auth",
    "/dashboard/%2f..%2f..%2fauth",
    "/dashboard/%5cevil",
    "/dashboard/%255cevil",
    "/dashboard/%00foo",
    "/dashboard/%",
  ])("falls back for unsafe input %j", (value) => {
    expect(safeReturnTo(value)).toBe("/dashboard");
  });
  it("preserves only validated destinations across a failed login", () => {
    const safe = new URL(signInLocation("/dashboard/wallets?range=30", "signin_failed"), "http://localhost");
    expect(safe.searchParams.get("returnTo")).toBe("/dashboard/wallets?range=30");
    expect(safe.searchParams.get("error")).toBe("signin_failed");
    expect(
      new URL(signInLocation("https://evil.test", "invalid_input"), "http://localhost").searchParams.get("returnTo"),
    ).toBe("/dashboard");
  });
});
