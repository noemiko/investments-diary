import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { TRANSFER_LIMITS } from "./schema";
import { TransferError } from "./signing";

/** Read every inflated byte before ExcelJS gets the archive, bounding declared and actual sizes. */
export async function inspectWorkbookZip(buffer: Buffer): Promise<void> {
  if (buffer.length > TRANSFER_LIMITS.fileBytes) throw new TransferError("too_large");
  await new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (openError, zip) => {
      if (openError) {
        reject(new TransferError("invalid_file"));
        return;
      }
      let entries = 0;
      let declared = 0;
      let inflated = 0;
      const names = new Set<string>();
      const fail = (error: unknown) => {
        zip.close();
        reject(error instanceof TransferError ? error : new TransferError("invalid_file"));
      };
      zip.on("error", fail);
      zip.on("entry", (entry: Entry) => {
        entries++;
        declared += entry.uncompressedSize;
        if (entries > TRANSFER_LIMITS.zipEntries || declared > TRANSFER_LIMITS.uncompressedBytes) {
          fail(new TransferError("too_large"));
          return;
        }
        if (
          entry.fileName.length > 512 ||
          names.has(entry.fileName) ||
          entry.fileName.startsWith("/") ||
          entry.fileName.split("/").includes("..") ||
          (entry.generalPurposeBitFlag & 1) !== 0 ||
          (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) ||
          entry.extraFieldLength > 4096 ||
          entry.fileCommentLength > 4096
        ) {
          fail(new TransferError("invalid_file"));
          return;
        }
        names.add(entry.fileName);
        if (entry.fileName.endsWith("/")) {
          zip.readEntry();
          return;
        }
        void consume(zip, entry, (size) => {
          inflated += size;
          if (inflated > TRANSFER_LIMITS.uncompressedBytes) throw new TransferError("too_large");
        }).then(() => {
          zip.readEntry();
        }, fail);
      });
      zip.on("end", () => {
        if (!names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) {
          fail(new TransferError("invalid_file"));
          return;
        }
        resolve();
      });
      zip.readEntry();
    });
  });
}

function consume(zip: ZipFile, entry: Entry, count: (size: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(new TransferError("invalid_file"));
        return;
      }
      stream.on("error", reject);
      stream.on("data", (chunk: Buffer) => {
        try {
          count(chunk.length);
        } catch (cause) {
          stream.destroy(cause instanceof Error ? cause : new TransferError("invalid_file"));
        }
      });
      stream.on("end", resolve);
    });
  });
}
