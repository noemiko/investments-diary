import { marketPriceEndpoint } from "@/lib/market-data/endpoint";
export const POST = marketPriceEndpoint("lookup");
export const ALL = POST;
