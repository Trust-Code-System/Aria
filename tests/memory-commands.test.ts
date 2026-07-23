import { describe, expect, it } from "vitest";

import { recognizeMemoryCommand } from "@/lib/ai/memory-commands";

describe("recognizeMemoryCommand", () => {
  it("treats 'save this to memory' as a referential save, not a literal fact", () => {
    // Regression: this previously parsed the content as the filler "to memory".
    expect(recognizeMemoryCommand("save this to memory")).toEqual({
      kind: "save_reference",
    });
  });

  it.each([
    "remember this",
    "save that",
    "save this to my memory",
    "add this to memory",
    "keep this in mind",
    "store that",
    "note this for later",
    "Please remember this.",
  ])("recognizes referential save: %s", (phrase) => {
    expect(recognizeMemoryCommand(phrase)).toEqual({ kind: "save_reference" });
  });

  it("keeps inline facts as a normal save with real content", () => {
    expect(recognizeMemoryCommand("remember that I prefer concise replies")).toEqual({
      kind: "save",
      content: "I prefer concise replies",
      update: false,
    });
  });

  it("does not misread a stated fact as referential", () => {
    const command = recognizeMemoryCommand("save this: my company is Trust Code");
    expect(command).toEqual({
      kind: "save",
      content: "my company is Trust Code",
      update: false,
    });
  });

  it("still recognizes recall and forget", () => {
    expect(recognizeMemoryCommand("what do you remember about me")).toEqual({
      kind: "recall",
    });
    expect(recognizeMemoryCommand("forget my old company")).toEqual({
      kind: "forget",
      query: "my old company",
    });
  });

  it("returns null for ordinary chat", () => {
    expect(recognizeMemoryCommand("what's the weather today?")).toBeNull();
  });
});
