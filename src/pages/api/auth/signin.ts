import { reportAuthError } from "@/lib/observability/auth";
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { parseSignInForm } from "@/lib/auth-validation";
import { safeReturnTo, signInLocation } from "@/lib/auth-return";

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return context.redirect(signInLocation(null, "invalid_input"));
  }
  const returnTo = safeReturnTo(form.get("returnTo"));
  const credentials = parseSignInForm(form);
  if (!credentials) return context.redirect(signInLocation(returnTo, "invalid_input"));

  try {
    const supabase = createClient(context.request.headers, context.cookies);
    const { error } = await supabase.auth.signInWithPassword(credentials);
    reportAuthError(error, "auth.signIn");
    if (error) return context.redirect(signInLocation(returnTo, "signin_failed"));
  } catch (error) {
    reportAuthError(error, "auth.signIn");
    return context.redirect(signInLocation(returnTo, "signin_failed"));
  }
  return context.redirect(returnTo);
};
