import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { examplePortfolio } from "./fixtures";
import { encodeWorkbook, decodeWorkbook } from "./workbook";
import { canonicalJson, parseSigningKeyRing, signRecovery, verifyRecovery, type SigningKeyRing } from "./signing";
import { recoveryPayloadSchema, TRANSFER_LIMITS } from "./schema";
import { inspectWorkbookZip } from "./zip";

const keys: SigningKeyRing = { activeKeyId: "v1", keys: { v1: "test-only-key-with-at-least-32-characters" } };
const deployment = "test-diary";
async function changedWorkbook(change: (book: ExcelJS.Workbook) => void) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await encodeWorkbook(examplePortfolio(), keys)).buffer);
  change(book);
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe("original portfolio workbook", () => {
  it("round trips exact recorded details, optional nulls, identities and original valuation timestamps", async () => {
    const source = examplePortfolio();
    const bytes = await encodeWorkbook(source, keys);
    expect(await decodeWorkbook(bytes, keys, deployment)).toEqual(source);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(bytes).buffer);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      "Read me",
      "Wallets",
      "Categories",
      "Investments",
      "Recovery data",
    ]);
    expect(book.getWorksheet("Recovery data")?.state).toBe("veryHidden");
    expect(book.getWorksheet("Wallets")?.getCell("C2").value).toBe("999999999999.12345678");
    expect(book.getWorksheet("Investments")?.getCell("P2").value).toBe("=literal text");
    expect(book.getWorksheet("Investments")?.getCell("Q2").value).toBe(source.data.positions[0].reason_text);
    if (process.env.PORTFOLIO_SAMPLE_PATH) await writeFile(process.env.PORTFOLIO_SAMPLE_PATH, bytes);
  });

  it("preserves Unicode when a supplementary character crosses a recovery chunk boundary", async () => {
    const value = examplePortfolio();
    // Find a legal text length placing an emoji's high surrogate at the end of the first chunk.
    value.data.positions[0].reason_text = "x".repeat(9000);
    value.data.positions[1].reason_text = "y".repeat(9000);
    value.data.positions.push({
      ...value.data.positions[1],
      id: "00000000-0000-4000-8000-000000000008",
      reason_text: "",
    });
    const textStart = canonicalJson(value).lastIndexOf('"reason_text":""') + '"reason_text":"'.length;
    const padding =
      (TRANSFER_LIMITS.chunkCharacters -
        1 -
        (textStart % TRANSFER_LIMITS.chunkCharacters) +
        TRANSFER_LIMITS.chunkCharacters) %
      TRANSFER_LIMITS.chunkCharacters;
    expect(padding).toBeLessThan(9999);
    value.data.positions[2].reason_text = `${"z".repeat(padding)}😀`;
    expect(canonicalJson(value).indexOf("😀") % TRANSFER_LIMITS.chunkCharacters).toBe(
      TRANSFER_LIMITS.chunkCharacters - 1,
    );
    const bytes = await encodeWorkbook(value, keys);
    expect(await decodeWorkbook(bytes, keys, deployment)).toEqual(value);
  });

  it("accepts supplementary Unicode up to PostgreSQL character limits", async () => {
    const value = examplePortfolio();
    value.data.positions[0].reason_text = "😀".repeat(6000);
    value.data.positions[0].broker_label = "😀".repeat(60);
    expect(await decodeWorkbook(await encodeWorkbook(value, keys), keys, deployment)).toEqual(value);
    value.data.positions[0].reason_text = "😀".repeat(10_001);
    expect(recoveryPayloadSchema.safeParse(value).success).toBe(false);
  });

  it("does not treat visible-sheet edits or formulas as recovery data", async () => {
    const bytes = await changedWorkbook((book) => {
      const cell = book.getWorksheet("Wallets")?.getCell("C2");
      if (cell) cell.value = { formula: "1+1", result: 2 };
    });
    expect(await decodeWorkbook(bytes, keys, deployment)).toEqual(examplePortfolio());
  });

  it("authenticates original payload bytes before parsing any JSON", () => {
    const envelope = signRecovery(examplePortfolio(), keys);
    expect(() => verifyRecovery({ ...envelope, payload: "not JSON" }, keys, deployment)).toThrow("invalid_signature");
    expect(() => verifyRecovery({ ...envelope, signature: "0".repeat(64) }, keys, deployment)).toThrow(
      "invalid_signature",
    );
    expect(() => verifyRecovery({ ...envelope, key_id: "unknown" }, keys, deployment)).toThrow("invalid_signature");
  });

  it("retains old verification keys and has no backup age expiry", () => {
    const envelope = signRecovery(examplePortfolio(), keys);
    const rotated = { activeKeyId: "v2", keys: { ...keys.keys, v2: "another-test-only-key-over-32-characters" } };
    expect(verifyRecovery(envelope, rotated, deployment)).toEqual(examplePortfolio());
    expect(() => verifyRecovery(envelope, rotated, "another-diary")).toThrow("wrong_deployment");
  });

  it("rejects unsupported schema versions even when the signature is valid", () => {
    const payload = canonicalJson({ ...examplePortfolio(), version: 2 });
    const signature = createHmac("sha256", keys.keys.v1)
      .update("portfolio-recovery-v1\nv1\n")
      .update(payload)
      .digest("hex");
    expect(() => verifyRecovery({ key_id: "v1", signature, payload }, keys, deployment)).toThrow("invalid_file");
  });

  it("rejects broken references, numeric financial values, impossible dates and unknown fields", () => {
    const value = examplePortfolio();
    expect(recoveryPayloadSchema.safeParse({ ...value, surprise: true }).success).toBe(false);
    value.data.positions[0].wallet_id = "00000000-0000-4000-8000-000000000999";
    expect(recoveryPayloadSchema.safeParse(value).success).toBe(false);
    const financial = examplePortfolio();
    const raw: unknown = { ...financial.data.wallets[0], starting_value: 123.45 };
    expect(recoveryPayloadSchema.safeParse({ ...financial, data: { ...financial.data, wallets: [raw] } }).success).toBe(
      false,
    );
    const impossible = examplePortfolio();
    impossible.data.positions[0].buy_date = "2026-02-30";
    expect(recoveryPayloadSchema.safeParse(impossible).success).toBe(false);
  });

  it("rejects altered payload cells and missing or unordered chunks", async () => {
    const altered = await changedWorkbook((book) => {
      const sheet = book.getWorksheet("Recovery data");
      if (sheet) sheet.getCell("B3").value = "changed";
    });
    await expect(decodeWorkbook(altered, keys, deployment)).rejects.toThrow("invalid_signature");
    const missing = await changedWorkbook((book) => {
      book.getWorksheet("Recovery data")?.spliceRows(3, 1);
    });
    await expect(decodeWorkbook(missing, keys, deployment)).rejects.toThrow("invalid_file");
    const unordered = await changedWorkbook((book) => {
      const sheet = book.getWorksheet("Recovery data");
      if (sheet) sheet.getCell("A3").value = "1";
    });
    await expect(decodeWorkbook(unordered, keys, deployment)).rejects.toThrow("invalid_file");
  });

  it("bounds file, payload and entity counts before interpreting recovery state", async () => {
    await expect(decodeWorkbook(Buffer.alloc(TRANSFER_LIMITS.fileBytes + 1), keys, deployment)).rejects.toThrow(
      "too_large",
    );
    expect(() =>
      verifyRecovery(
        { key_id: "v1", payload: " ".repeat(TRANSFER_LIMITS.payloadBytes + 1), signature: "0".repeat(64) },
        keys,
        deployment,
      ),
    ).toThrow("too_large");
    const value = examplePortfolio();
    value.data.wallets = Array.from({ length: TRANSFER_LIMITS.records + 1 }, () => value.data.wallets[0]);
    expect(recoveryPayloadSchema.safeParse(value).success).toBe(false);
  });

  it("rejects non-workbook archives and invalid transfer configuration", async () => {
    await expect(inspectWorkbookZip(Buffer.from("not a zip"))).rejects.toThrow("invalid_file");
    expect(() => parseSigningKeyRing('{"activeKeyId":"v1","keys":{"v1":"short"}}')).toThrow("not_configured");
    expect(parseSigningKeyRing(JSON.stringify(keys))).toEqual(keys);
  });

  it("rejects a compressed workbook whose inflated content exceeds the limit", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Huge");
    const text = "x".repeat(24_000);
    // Unique values prevent shared-string deduplication from shrinking the inflated fixture.
    for (let i = 0; i < 1500; i++) sheet.addRow([`${text}${String(i)}`]);
    const bytes = Buffer.from(await book.xlsx.writeBuffer({ useSharedStrings: false }));
    expect(bytes.length).toBeLessThan(TRANSFER_LIMITS.fileBytes);
    await expect(inspectWorkbookZip(bytes)).rejects.toThrow("too_large");
  }, 20_000);
});
