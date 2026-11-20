import "../sentry.server.config";
import { withIsolationScope } from "@sentry/astro";
import { reportAuthError } from "@/lib/observability/auth";
import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

import { safeReturnTo, signInLocation } from "@/lib/auth-return";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware((context, next) =>
  withIsolationScope(async (scope) => {
    scope.setTag("request_id", crypto.randomUUID());
    scope.setTag("route", context.routePattern);
    const supabase = createClient(context.request.headers, context.cookies);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    reportAuthError(error, "auth.getUser");
    context.locals.user = user ?? null;

    if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
      if (!context.locals.user) {
        return context.redirect(
          context.request.method === "GET" ? signInLocation(context.url.pathname + context.url.search) : "/auth/signin",
        );
      }
    }

    if (context.url.pathname === "/") {
      return context.redirect(user ? "/dashboard" : "/auth/signin");
    }

    if (context.url.pathname === "/auth/signin" && user) {
      return context.redirect(safeReturnTo(context.url.searchParams.get("returnTo")));
    }

    return next();
  }),
);
