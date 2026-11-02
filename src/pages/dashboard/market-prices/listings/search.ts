import { marketPriceEndpoint } from "@/lib/market-data/endpoint";
export const POST = marketPriceEndpoint("search");
export const ALL = POST;
