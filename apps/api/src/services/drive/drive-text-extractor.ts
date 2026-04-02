import type { drive_v3 } from "googleapis";
import { PDFParse } from "pdf-parse";
import { withBackoff } from "./drive-api-backoff.js";

const GOOGLE_DOCS_MIME = "application/vnd.google-apps.document";
const GOOGLE_SHEETS_MIME = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";

/**
 * Extract plain text from a Google Drive file.
 * - Google Docs/Slides → export as text/plain
 * - Google Sheets → export as text/csv
 * - PDF → download binary, extract with pdf-parse
 * - text/* → download as text
 */
export async function extractTextFromDriveFile(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string
): Promise<string | null> {
  try {
    if (mimeType === GOOGLE_DOCS_MIME || mimeType === GOOGLE_SLIDES_MIME) {
      return await exportAsText(drive, fileId, "text/plain");
    }

    if (mimeType === GOOGLE_SHEETS_MIME) {
      return await exportAsText(drive, fileId, "text/csv");
    }

    if (mimeType === "application/pdf") {
      return await downloadAndParsePdf(drive, fileId);
    }

    // Plain text files
    if (mimeType.startsWith("text/")) {
      return await downloadAsText(drive, fileId);
    }

    return null;
  } catch (err) {
    console.error(`[drive-text-extractor] Failed to extract text for ${fileId}:`, err);
    return null;
  }
}

async function exportAsText(
  drive: drive_v3.Drive,
  fileId: string,
  exportMime: string
): Promise<string | null> {
  const res = await withBackoff(() =>
    drive.files.export({ fileId, mimeType: exportMime }, { responseType: "text" })
  );
  const text = typeof res.data === "string" ? res.data : String(res.data ?? "");
  return text.trim() || null;
}

async function downloadAsText(drive: drive_v3.Drive, fileId: string): Promise<string | null> {
  const res = await withBackoff(() =>
    drive.files.get({ fileId, alt: "media" }, { responseType: "text" })
  );
  const text = typeof res.data === "string" ? res.data : String(res.data ?? "");
  return text.trim() || null;
}

async function downloadAndParsePdf(drive: drive_v3.Drive, fileId: string): Promise<string | null> {
  const res = await withBackoff(() =>
    drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" })
  );

  const buffer = Buffer.from(res.data as ArrayBuffer);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const textResult = await parser.getText();
    return textResult.text?.trim() || null;
  } finally {
    await parser.destroy().catch(() => {});
  }
}
