import type { APIRoute } from "astro";
import { handlePortfolio } from "@/lib/portfolio-transfer/endpoint";
export const POST: APIRoute = (context) => handlePortfolio(context, "replace");
export const ALL = POST;
