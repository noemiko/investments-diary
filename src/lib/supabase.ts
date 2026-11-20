import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { sessionCookieOptions } from "@/lib/auth-cookies";
import type { ApiDatabase } from "@/db/api.types";

// Dev must never talk to the hosted (production) project — run `npx supabase start` instead.
if (import.meta.env.DEV && SUPABASE_URL && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(SUPABASE_URL)) {
  throw new Error(
    `SUPABASE_URL points at ${new URL(SUPABASE_URL).host} in dev. Use the local stack (http://127.0.0.1:54321), see README.`,
  );
}

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  // env.schema marks both as required, but an empty string still gets past it.
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY must be non-empty, see README.");
  }
  return createServerClient<ApiDatabase>(SUPABASE_URL, SUPABASE_KEY, {
    cookieOptions: sessionCookieOptions(import.meta.env.PROD),
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
