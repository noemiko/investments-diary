import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { restorePosition } from "@/lib/services/positions";
import { isUuid } from "@/lib/validation/uuid";

// Restores a deleted position from the Undo notice or the Deleted positions page.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const { id } = context.params;
  if (!isUuid(id)) {
    return context.rewrite("/dashboard/positions/not-found");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  const result = await restorePosition(supabase, id);
  if (!result.ok) {
    if (result.error === "not_found") {
      return context.rewrite("/dashboard/positions/not-found");
    }
    return context.redirect("/dashboard?error=restore_failed");
  }

  return context.redirect("/dashboard");
};
