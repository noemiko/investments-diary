import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deletePosition } from "@/lib/services/positions";
import { isUuid } from "@/lib/validation/uuid";

// Soft-deletes a position from the inline confirmation, then shows the Undo notice on the dashboard.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const { id } = context.params;
  if (!isUuid(id)) {
    return context.rewrite("/dashboard/positions/not-found");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  const result = await deletePosition(supabase, id);
  if (!result.ok) {
    if (result.error === "not_found") {
      return context.rewrite("/dashboard/positions/not-found");
    }
    return context.redirect("/dashboard?error=delete_failed");
  }

  return context.redirect(`/dashboard?deleted=${id}`);
};
