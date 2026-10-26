import { reportAuthError } from "@/lib/observability/auth";
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  const { error } = await supabase.auth.signOut();
  reportAuthError(error, "auth.signOut");
  return context.redirect("/");
};
