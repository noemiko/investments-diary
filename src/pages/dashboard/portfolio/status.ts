import type { APIRoute } from "astro";
import { handlePortfolio } from "@/lib/portfolio-transfer/endpoint";
export const GET: APIRoute = (context) => handlePortfolio(context, "status");
export const ALL = GET;
