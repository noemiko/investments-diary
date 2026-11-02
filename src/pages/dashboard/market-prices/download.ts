import { marketPriceEndpoint } from "@/lib/market-data/endpoint";
export const POST = marketPriceEndpoint("download");
export const ALL = POST;
