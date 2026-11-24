import ExcelJS from "exceljs";
import { TRANSFER_LIMITS, type RecoveryPayload } from "./schema";
import { signRecovery, verifyRecovery, TransferError, type SigningKeyRing } from "./signing";
import { inspectWorkbookZip } from "./zip";

/** Spreadsheet XML cannot represent these characters; the authenticated payload keeps the originals. */
function displayText(value: string | null): string | null {
  if (value === null) return null;
  const escaped = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const unsupportedControl = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    return unsupportedControl || code === 0x7f || code === 0xfffe || code === 0xffff
      ? `\\u${code.toString(16).padStart(4, "0")}`
      : character;
  }).join("");
  if (escaped.length <= 32_767) return escaped;
  const suffix = "… [display shortened]";
  let end = 32_767 - suffix.length;
  const last = escaped.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return escaped.slice(0, end) + suffix;
}

function dataSheet(book: ExcelJS.Workbook, name: string, headers: string[], rows: (string | null)[][]) {
  const sheet = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = headers.map((header) => ({ header, width: header.includes("reason") ? 60 : 24 }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17324D" } };
  for (const values of rows) {
    const row = sheet.addRow(values.map(displayText));
    row.eachCell((cell) => {
      cell.numFmt = "@";
      cell.alignment = { vertical: "top", wrapText: true };
    });
  }
  if (headers.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  return sheet;
}

export async function encodeWorkbook(payload: RecoveryPayload, keyRing: SigningKeyRing): Promise<Buffer> {
  const envelope = signRecovery(payload, keyRing);
  const book = new ExcelJS.Workbook();
  book.creator = "Investments diary";
  book.created = new Date(payload.exported_at);
  const help = book.addWorksheet("Read me");
  help.getColumn(1).width = 110;
  for (const line of [
    "Portfolio export — personal analysis and recovery",
    `Exported at: ${payload.exported_at}`,
    `Export ID: ${payload.export_id}`,
    "Keep this original downloaded XLSX unchanged for recovery. Work on a separate copy for analysis.",
    "Open your analysis copy in Excel or Google Sheets. Google-converted files are not guaranteed recovery files.",
    "Recovery uses authenticated export data, not edited visible cells or spreadsheet formulas.",
    "Recovery replaces the destination portfolio after a preview and explicit confirmation.",
    "Amounts, prices and quantities marked exact text preserve database precision. Convert copies for calculations.",
    "Dates and timestamps are ISO text. Blank optional cells represent missing values, not zero.",
    "Valuations are recorded at export time and may be old. Export does not download prices.",
    "Deleted investments and historical wallet charts are not included.",
    "Characters unsupported by spreadsheet XML are shown as \\uXXXX. Long escaped displays are shortened; recovery keeps the exact original text.",
  ])
    help.addRow([line]);
  help.getRow(1).font = { bold: true, size: 16 };
  const { data } = payload;
  dataSheet(
    book,
    "Wallets",
    ["wallet_id", "name", "starting_value (exact text)", "currency", "created_at"],
    data.wallets.map((row) => [row.id, row.name, row.starting_value, row.currency, row.created_at]),
  );
  dataSheet(
    book,
    "Categories",
    ["category_id", "name", "created_at", "retired_at"],
    data.categories.map((row) => [row.id, row.name, row.created_at, row.deleted_at]),
  );
  const wallets = new Map(data.wallets.map((row) => [row.id, row]));
  const categories = new Map(data.categories.map((row) => [row.id, row.name]));
  const targets = new Map(data.targets.map((row) => [row.id, row]));
  const quotes = new Map(data.quotes.map((row) => [row.id, row]));
  dataSheet(
    book,
    "Investments",
    [
      "investment_id",
      "wallet_id",
      "wallet",
      "category_id",
      "category",
      "instrument",
      "status",
      "currency",
      "buy_date",
      "buy_price (exact text)",
      "quantity (exact text)",
      "opening_commission (exact text)",
      "sell_date",
      "sell_price (exact text)",
      "closing_commission (exact text)",
      "broker_label",
      "reason",
      "manual_price (exact text)",
      "manual_price_date",
      "manual_saved_at",
      "selected_price (exact text)",
      "selected_date",
      "selected_at",
      "selected_source",
      "stock_symbol",
      "stock_exchange",
      "instrument_type",
      "quote_market_at",
      "quote_fetched_at",
      "created_at",
    ],
    data.positions.map((row) => {
      const target = targets.get(row.market_target_id);
      const quote = row.market_listing_id ? quotes.get(row.market_listing_id) : undefined;
      return [
        row.id,
        row.wallet_id,
        wallets.get(row.wallet_id)?.name ?? null,
        row.category_id,
        categories.get(row.category_id) ?? null,
        row.instrument,
        row.sell_price === null ? "Open" : "Closed",
        wallets.get(row.wallet_id)?.currency ?? null,
        row.buy_date,
        row.buy_price,
        row.quantity,
        row.opening_commission,
        row.sell_date,
        row.sell_price,
        row.closing_commission,
        row.broker_label,
        row.reason_text,
        row.current_price,
        row.price_date,
        row.manual_price_saved_at,
        row.selected_price,
        row.selected_date,
        row.selected_at,
        row.selected_source,
        target?.symbol ?? null,
        target?.exchange ?? null,
        target?.instrument_type ?? null,
        quote?.market_at ?? null,
        quote?.fetched_at ?? null,
        row.created_at,
      ];
    }),
  );
  const recovery = book.addWorksheet("Recovery data", { state: "veryHidden" });
  recovery.addRow(["portfolio-recovery-v1", envelope.key_id, envelope.signature]);
  const chunks: string[] = [];
  for (let start = 0; start < envelope.payload.length;) {
    let end = Math.min(start + TRANSFER_LIMITS.chunkCharacters, envelope.payload.length);
    const last = envelope.payload.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(envelope.payload.slice(start, end));
    start = end;
  }
  recovery.addRow(["chunks", String(chunks.length)]);
  chunks.forEach((chunk, index) => {
    recovery.addRow([String(index), chunk]);
  });
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  if (buffer.length > TRANSFER_LIMITS.fileBytes) throw new TransferError("too_large");
  await inspectWorkbookZip(buffer);
  return buffer;
}

export async function decodeWorkbook(
  buffer: Buffer,
  keyRing: SigningKeyRing,
  deploymentId: string,
): Promise<RecoveryPayload> {
  await inspectWorkbookZip(buffer);
  try {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(buffer).buffer);
    const sheet = book.getWorksheet("Recovery data");
    if (sheet?.getCell("A1").value !== "portfolio-recovery-v1" || sheet.getCell("A2").value !== "chunks")
      throw new TransferError("invalid_file");
    const keyId = sheet.getCell("B1").value;
    const signature = sheet.getCell("C1").value;
    const count = sheet.getCell("B2").value;
    if (
      typeof keyId !== "string" ||
      keyId.length > 100 ||
      typeof signature !== "string" ||
      typeof count !== "string" ||
      !/^[1-9]\d{0,3}$/.test(count)
    )
      throw new TransferError("invalid_file");
    const chunkCount = Number(count);
    if (
      chunkCount > Math.ceil(TRANSFER_LIMITS.payloadBytes / TRANSFER_LIMITS.chunkCharacters) ||
      sheet.rowCount !== chunkCount + 2
    )
      throw new TransferError("invalid_file");
    const chunks: string[] = [];
    for (let index = 0; index < chunkCount; index++) {
      const row = sheet.getRow(index + 3);
      const chunk = row.getCell(2).value;
      if (
        row.getCell(1).value !== String(index) ||
        typeof chunk !== "string" ||
        chunk.length > TRANSFER_LIMITS.chunkCharacters
      )
        throw new TransferError("invalid_file");
      chunks.push(chunk);
    }
    return verifyRecovery({ key_id: keyId, signature, payload: chunks.join("") }, keyRing, deploymentId);
  } catch (error) {
    if (error instanceof TransferError) throw error;
    throw new TransferError("invalid_file");
  }
}
