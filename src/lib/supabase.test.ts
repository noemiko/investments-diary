import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";

const captured = vi.hoisted<{ options: unknown }>(() => ({ options: undefined }));
vi.mock("astro:env/server", () => ({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_KEY: "local-test-key" }));
vi.mock("@supabase/ssr", async (importOriginal) => {
  const original = await importOriginal<typeof import("@supabase/ssr")>();
  return {
    ...original,
    createServerClient: (_url: unknown, _key: unknown, options: unknown) => {
      captured.options = options;
      return {};
    },
  };
});

interface ClientOptions {
  cookieOptions: { httpOnly: boolean; sameSite: string; path: string; secure: boolean };
  cookies: {
    getAll: () => { name: string; value?: string }[];
    setAll: (values: { name: string; value: string; options: Record<string, unknown> }[]) => void;
  };
}
beforeEach(() => {
  captured.options = undefined;
});

describe("Supabase SSR cookie adapter", () => {
  it("passes the explicit policy into the real client construction boundary", () => {
    createClient(new Headers(), { set: vi.fn() } as unknown as AstroCookies);
    const options = captured.options as ClientOptions;
    expect(options.cookieOptions).toEqual({ httpOnly: true, sameSite: "lax", path: "/", secure: import.meta.env.PROD });
    expect(options.cookieOptions).not.toHaveProperty("maxAge");
    expect(options.cookieOptions).not.toHaveProperty("name");
  });
  it("retains chunked session names, refresh lifetimes and deletion options from SSR", () => {
    const set = vi.fn();
    createClient(new Headers({ Cookie: "sb-local-auth-token.0=first; sb-local-auth-token.1=second" }), {
      set,
    } as unknown as AstroCookies);
    const options = captured.options as ClientOptions;
    expect(options.cookies.getAll()).toEqual([
      { name: "sb-local-auth-token.0", value: "first" },
      { name: "sb-local-auth-token.1", value: "second" },
    ]);
    const refresh = { path: "/", httpOnly: true, sameSite: "lax", maxAge: 34560000 };
    const deletion = { ...refresh, maxAge: 0 };
    options.cookies.setAll([
      { name: "sb-local-auth-token.0", value: "refreshed", options: refresh },
      { name: "sb-local-auth-token.1", value: "", options: deletion },
    ]);
    expect(set).toHaveBeenNthCalledWith(1, "sb-local-auth-token.0", "refreshed", refresh);
    expect(set).toHaveBeenNthCalledWith(2, "sb-local-auth-token.1", "", deletion);
  });
});
