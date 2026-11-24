import type { APIRoute } from "astro";
import { handlePortfolio } from "@/lib/portfolio-transfer/endpoint";
export const POST: APIRoute = (context) => handlePortfolio(context, "undo");
export const ALL = POST;
