/**
 * Client-side document text extraction.
 *
 * Runs inside the webview so the Rust side can stay thin — we only send
 * plain text over the Tauri boundary, not raw document bytes. Supports:
 *   - PDF via pdfjs-dist
 *   - DOCX via mammoth
 *   - TXT / MD / anything readable as UTF-8
 */

export type ExtractableFormat = "pdf" | "docx" | "text";

export interface ExtractedDocument {
  text: string;
  format: ExtractableFormat;
  /** Number of pages for paginated formats, undefined for flat text. */
  pageCount?: number;
  /** Non-fatal warnings from the extractor. */
  warnings: string[];
}

export function detectDocumentFormat(fileName: string): ExtractableFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".rtf")
  ) {
    return "text";
  }
  return null;
}

async function extractPdf(file: File): Promise<ExtractedDocument> {
  // Dynamic import so pdf.js only loads when the user actually uploads a PDF.
  const pdfjs = await import("pdfjs-dist");
  // pdfjs ships a worker that Vite can serve as a module URL.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  const warnings: string[] = [];
  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      parts.push(pageText);
    } catch (err) {
      warnings.push(`Page ${pageNum} failed to extract: ${String(err)}`);
    }
  }

  return {
    text: parts.join("\n\n"),
    format: "pdf",
    pageCount: doc.numPages,
    warnings,
  };
}

async function extractDocx(file: File): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return {
    text: result.value,
    format: "docx",
    warnings: result.messages.map((m) => m.message),
  };
}

async function extractText(file: File): Promise<ExtractedDocument> {
  const text = await file.text();
  return { text, format: "text", warnings: [] };
}

/**
 * Extract plain text from a PDF, DOCX, or plain text file.
 * Throws if the format is unsupported or the file cannot be read.
 */
export async function extractTextFromFile(file: File): Promise<ExtractedDocument> {
  const format = detectDocumentFormat(file.name);
  if (!format) {
    throw new Error(
      `Unsupported document format: ${file.name}. Use PDF, DOCX, or TXT.`,
    );
  }
  switch (format) {
    case "pdf":
      return extractPdf(file);
    case "docx":
      return extractDocx(file);
    case "text":
      return extractText(file);
  }
}
