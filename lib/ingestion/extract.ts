import { getExtension } from "@/lib/security/sanitize";

/**
 * Text extraction from uploaded files. Returns plain text plus optional
 * per-page markers used to attribute chunks to page numbers for citations.
 *
 * PDF parsing uses `pdf-parse` loaded dynamically so the app builds even if the
 * dependency isn't installed yet (it degrades to a clear "failed" status which
 * the ingestion pipeline logs and surfaces in the UI).
 */

export interface ExtractResult {
  text: string;
  pages?: string[]; // text per page when available (PDF)
  status: "ok" | "empty" | "failed";
  detail?: string;
}

export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<ExtractResult> {
  const ext = getExtension(filename);

  try {
    if (ext === "pdf" || mimeType === "application/pdf") {
      return await extractPdf(buffer);
    }
    if (ext === "docx") {
      return await extractDocx(buffer);
    }
    if (["txt", "md", "markdown", "csv", "json"].includes(ext)) {
      const text = buffer.toString("utf-8");
      return { text, status: text.trim() ? "ok" : "empty" };
    }
    // Fallback: try utf-8.
    const text = buffer.toString("utf-8");
    return { text, status: text.trim() ? "ok" : "empty" };
  } catch (e) {
    return {
      text: "",
      status: "failed",
      detail: e instanceof Error ? e.message : "extraction error",
    };
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  let pdfParse: (b: Buffer, opts?: unknown) => Promise<{ text: string; numpages: number }>;
  try {
    // Import the lib entry directly: the package index enables a debug mode that
    // reads a test file when `module.parent` is falsy (as under dynamic import).
    const mod: any = await import("pdf-parse/lib/pdf-parse.js");
    pdfParse = mod.default ?? mod;
  } catch {
    return {
      text: "",
      status: "failed",
      detail:
        "PDF parser not installed. Run `npm i pdf-parse` to enable PDF ingestion.",
    };
  }

  // Collect per-page text via the pagerender hook for page-accurate citations.
  const pages: string[] = [];
  const data = await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const content = await pageData.getTextContent();
      const strings = content.items.map((it: any) => it.str);
      const pageText = strings.join(" ");
      pages.push(pageText);
      return pageText;
    },
  });

  const text = (data.text || pages.join("\n\n")).trim();
  return {
    text,
    pages: pages.length ? pages : undefined,
    status: text ? "ok" : "empty",
  };
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  try {
    const mod: any = await import("mammoth");
    const result = await mod.extractRawText({ buffer });
    const text = (result.value || "").trim();
    return { text, status: text ? "ok" : "empty" };
  } catch {
    return {
      text: "",
      status: "failed",
      detail: "DOCX parser not installed. Run `npm i mammoth` to enable DOCX ingestion.",
    };
  }
}
