import { Stryker } from "@stryker-mutator/core";

// Separate reports keep each risk's evidence reviewable. An optional module key narrows a rerun.
const scopes = {
  result: "src/lib/result.ts",
  decimal: "src/lib/decimal.ts",
  parser: "src/lib/validation/decimal.ts",
  wallet: "src/lib/wallet.ts",
  format: "src/lib/format.ts",
  transport: "src/lib/services/decimal.ts",
  pagination: "src/lib/services/read-all.ts",
  "position-reads": "src/lib/services/positions.ts:65-123",
  "wallet-reads": "src/lib/services/wallets.ts:29-66",
};
const selected = process.argv.slice(2);
if (selected.some((key) => !Object.hasOwn(scopes, key))) {
  console.error(`Choose module keys: ${Object.keys(scopes).join(", ")}`);
  process.exit(1);
}
for (const key of selected.length ? selected : Object.keys(scopes)) {
  const base = `reports/mutation/${key}`;
  await new Stryker({
    mutate: [scopes[key]],
    htmlReporter: { fileName: `${base}/mutation.html` },
    jsonReporter: { fileName: `${base}/mutation.json` },
  }).runMutationTest();
}
