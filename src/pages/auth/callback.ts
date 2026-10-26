import { reportAuthError } from "@/lib/observability/auth";
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

// Landing route for the signup confirmation link. Supabase verifies the token, then redirects
// here with either ?code=<pkce-code> (success) or ?error=...&error_description=... (failure).
// Failures go to sign-in, not sign-up: a reused link, a mail scanner's pre-click, or a link opened
// on another device (no PKCE verifier cookie) all fail here although the email is already confirmed.
const LINK_FAILED = "This link was already used or has expired. Try signing in; if that fails, sign up again.";

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");

  if (!code) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(LINK_FAILED)}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  reportAuthError(error, "auth.exchangeCode");
  const redirectUrl = error ? `/auth/signin?error=${encodeURIComponent(LINK_FAILED)}` : "/dashboard";
  return context.redirect(redirectUrl);
};
