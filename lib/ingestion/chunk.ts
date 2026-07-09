/**
 * Chunking. Splits text into overlapping, roughly token-bounded chunks while
 * trying to respect paragraph and sentence boundaries. Carries page numbers
 * through when per-page text is available so citations can reference a page.
 */

export interface Chunk {
  content: string;
  chunkIndex: number;
  pageNumber: number | null;
  sectionTitle: string | null;
  tokenCount: number;
}

// ~4 chars per token heuristic; keep chunks comfortably inside embedding limits.
const TARGET_TOKENS = 350;
const OVERLAP_TOKENS = 60;
const CHARS_PER_TOKEN = 4;

export function chunkText(
  text: string,
  opts?: { pages?: string[] },
): Chunk[] {
  if (opts?.pages && opts.pages.length > 0) {
    return chunkByPages(opts.pages);
  }
  return chunkPlain(text, null);
}

function chunkByPages(pages: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  pages.forEach((pageText, i) => {
    const pageChunks = chunkPlain(pageText, i + 1, index);
    index += pageChunks.length;
    chunks.push(...pageChunks);
  });
  // Re-number sequentially.
  return chunks.map((c, i) => ({ ...c, chunkIndex: i }));
}

function chunkPlain(
  text: string,
  pageNumber: number | null,
  startIndex = 0,
): Chunk[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];

  const targetChars = TARGET_TOKENS * CHARS_PER_TOKEN;
  const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;

  // Split into paragraphs, then greedily pack into chunks.
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: Chunk[] = [];
  let buf = "";
  let sectionTitle: string | null = null;

  const flush = () => {
    const content = buf.trim();
    if (content) {
      chunks.push({
        content,
        chunkIndex: startIndex + chunks.length,
        pageNumber,
        sectionTitle,
        tokenCount: Math.ceil(content.length / CHARS_PER_TOKEN),
      });
    }
    buf = "";
  };

  for (const para of paragraphs) {
    // Track a rough section title from markdown headings.
    const headingMatch = para.match(/^#{1,3}\s+(.+)$/m);
    if (headingMatch) sectionTitle = headingMatch[1].slice(0, 120);

    if ((buf + "\n\n" + para).length > targetChars && buf) {
      flush();
      // Start next buffer with a tail overlap from the previous chunk.
      const prev = chunks[chunks.length - 1]?.content ?? "";
      buf = prev.slice(-overlapChars);
    }

    if (para.length > targetChars) {
      // Very long paragraph — hard-split by sentences.
      for (const sentence of splitSentences(para)) {
        if ((buf + " " + sentence).length > targetChars && buf) flush();
        buf = buf ? buf + " " + sentence : sentence;
      }
    } else {
      buf = buf ? buf + "\n\n" + para : para;
    }
  }
  flush();

  return chunks;
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]*/g) ?? [text];
}
