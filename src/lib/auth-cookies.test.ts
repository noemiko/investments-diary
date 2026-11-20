import { describe, expect, it } from "vitest";
import { sessionCookieOptions } from "@/lib/auth-cookies";

describe("server session cookie policy", () => {
  it("uses HttpOnly, SameSite Lax and root scope on local HTTP", () => {
    expect(sessionCookieOptions(false)).toEqual({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
  });
  it("requires Secure in production without replacing lifetime or storage keys", () => {
    expect(sessionCookieOptions(true)).toEqual({ httpOnly: true, sameSite: "lax", path: "/", secure: true });
    expect(sessionCookieOptions(true)).not.toHaveProperty("name");
    expect(sessionCookieOptions(true)).not.toHaveProperty("maxAge");
  });
});
