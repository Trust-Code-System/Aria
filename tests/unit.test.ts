import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/ingestion/chunk";
import { validateCitations } from "@/lib/ai/rag";
import { sanitizeForLog, sanitizeFilename, validateFile } from "@/lib/security/sanitize";
import { renderRetrievedContext } from "@/lib/ai/prompts";
import { mdToHtml } from "@/lib/reports/pdf";
import { parseModelId } from "@/lib/ai/providers";

describe("chunking", () => {
  it("splits long text into multiple bounded chunks", () => {
    const text = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}. ${"word ".repeat(60)}`).join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length > 0)).toBe(true);
    // Sequential indices
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  it("carries page numbers when pages provided", () => {
    const pages = ["Page one text ".repeat(40), "Page two text ".repeat(40)];
    const chunks = chunkText(pages.join("\n"), { pages });
    expect(chunks.some((c) => c.pageNumber === 1)).toBe(true);
    expect(chunks.some((c) => c.pageNumber === 2)).toBe(true);
  });

  it("returns empty for empty input", () => {
    expect(chunkText("")).toEqual([]);
  });
});

describe("citation validation (hallucination guard)", () => {
  it("accepts valid indices and flags out-of-range ones", () => {
    const answer = "Claim A [1]. Claim B [2]. Bogus [9].";
    const { cited, invalid } = validateCitations(answer, 3);
    expect(cited.sort()).toEqual([1, 2]);
    expect(invalid).toEqual([9]);
  });
});

describe("security sanitization", () => {
  it("redacts secrets and emails from log strings", () => {
    const out = sanitizeForLog("failed with sk-abcdefghijklmnopqrstuv and user a@b.com");
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuv");
    expect(out).not.toContain("a@b.com");
    expect(out).toContain("[redacted]");
  });

  it("sanitizes filenames", () => {
    expect(sanitizeFilename("../../etc/pa ss?wd.txt")).not.toContain("/");
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
  });

  it("rejects disallowed file types and oversize files", () => {
    expect(validateFile({ name: "a.exe", size: 10, type: "" }).ok).toBe(false);
    expect(validateFile({ name: "a.pdf", size: 0, type: "application/pdf" }).ok).toBe(false);
    expect(validateFile({ name: "a.pdf", size: 1000, type: "application/pdf" }).ok).toBe(true);
  });
});

describe("retrieved context rendering", () => {
  it("numbers sources and builds matching citations", () => {
    const { contextBlock, citations } = renderRetrievedContext([
      { content: "hello", filename: "doc.pdf", page_number: 2, section_title: null, source_url: null },
    ]);
    expect(contextBlock).toContain("[1] doc.pdf (p.2)");
    expect(citations[0]).toMatchObject({ index: 1, title: "doc.pdf", page: 2, kind: "file" });
  });
});

describe("markdown to html (reports)", () => {
  it("renders headings, lists, and escapes html", () => {
    const html = mdToHtml("# Title\n\n- one\n- two\n\n<script>alert(1)</script>");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<li>one</li>");
    expect(html).not.toContain("<script>");
  });
});

describe("provider model id parsing", () => {
  it("parses provider:model", () => {
    expect(parseModelId("anthropic:claude-3-5-sonnet-latest")).toEqual({
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
    });
  });
  it("falls back to openai when no prefix", () => {
    expect(parseModelId("gpt-4o-mini")).toEqual({ provider: "openai", model: "gpt-4o-mini" });
  });
});
