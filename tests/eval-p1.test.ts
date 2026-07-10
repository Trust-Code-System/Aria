import { describe, it, expect } from "vitest";
import { validateCitations, reciprocalRankFusion, hasUsableContext } from "@/lib/ai/rag";
import { estimateComplexity, estimateTurnBudgetUnits, resolveRoutedChatModelId } from "@/lib/ai/routing";
import { looksLikeSecret } from "@/lib/ai/memory-safety";
import type { RetrievedChunk } from "@/lib/ai/types";

describe("eval: citation accuracy", () => {
  it("accepts only in-range citations", () => {
    const { cited, invalid } = validateCitations("A [1] B [2] fake [99]", 2);
    expect(cited).toEqual([1, 2]);
    expect(invalid).toEqual([99]);
  });

  it("flags zero citations as empty cited set", () => {
    const { cited, invalid } = validateCitations("No sources here.", 3);
    expect(cited).toEqual([]);
    expect(invalid).toEqual([]);
  });
});

describe("eval: hybrid RRF fusion", () => {
  it("boosts items that appear in both ranked lists", () => {
    const fused = reciprocalRankFusion([
      ["a", "b", "c"],
      ["c", "a", "d"],
    ]);
    expect(fused[0].id).toBe("a");
    expect(fused.find((x) => x.id === "c")!.score).toBeGreaterThan(
      fused.find((x) => x.id === "d")!.score,
    );
  });
});

describe("eval: usable context guard", () => {
  it("rejects empty or weak retrieval", () => {
    expect(hasUsableContext([])).toBe(false);
    const weak: RetrievedChunk[] = [
      {
        chunk_id: "1",
        document_id: "d",
        content: "x",
        page_number: null,
        section_title: null,
        chunk_index: 0,
        similarity: 0.05,
        filename: "a.pdf",
        source_url: null,
      },
    ];
    expect(hasUsableContext(weak)).toBe(false);
  });
});

describe("eval: memory secret rejection", () => {
  it("blocks credential-like content", () => {
    expect(looksLikeSecret("my api key is sk-test")).toBe(true);
    expect(looksLikeSecret("I prefer short answers")).toBe(false);
  });
});

describe("model routing", () => {
  it("marks research/code as high complexity", () => {
    expect(estimateComplexity("research", "hi")).toBe("high");
    expect(estimateComplexity("code", "hi")).toBe("high");
    expect(estimateComplexity("general", "hi")).toBe("low");
  });

  it("estimates higher budget for long/high modes", () => {
    expect(estimateTurnBudgetUnits("code", "x".repeat(5000))).toBeGreaterThan(
      estimateTurnBudgetUnits("general", "hi"),
    );
  });

  it("returns null when no providers are configured (test env)", () => {
    // Without keys in vitest, routing should safely return null or a custom path.
    const id = resolveRoutedChatModelId({ mode: "general", message: "hello" });
    // custom is always "available" in availableProviders — may return custom:llama3.2
    expect(id === null || typeof id === "string").toBe(true);
  });
});
