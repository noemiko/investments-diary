/** Leave storage keys, chunking and lifetime to the installed Supabase SSR client. */
export function sessionCookieOptions(production: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: production };
}
