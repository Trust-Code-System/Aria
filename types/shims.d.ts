// Ambient declarations for optional/untyped dependencies.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: unknown;
    metadata?: unknown;
  }
  function pdfParse(dataBuffer: Buffer, options?: unknown): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module "mammoth";
