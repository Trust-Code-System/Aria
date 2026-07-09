import { describe, it, expect } from "vitest";
import { continueList } from "@/lib/editor/list-continuation";

// Caret is placed at the end of `value` in these cases (typical "press Enter" spot).
function atEnd(value: string) {
  return continueList(value, value.length);
}

describe("continueList", () => {
  it("continues an ordered list, incrementing the number", () => {
    const r = atEnd("1. first");
    expect(r).not.toBeNull();
    expect(r!.value).toBe("1. first\n2. ");
    expect(r!.caret).toBe("1. first\n2. ".length);
  });

  it("continues an unordered list with the same bullet", () => {
    expect(atEnd("- apple")!.value).toBe("- apple\n- ");
    expect(atEnd("* apple")!.value).toBe("* apple\n* ");
  });

  it("preserves indentation", () => {
    expect(atEnd("  2. nested")!.value).toBe("  2. nested\n  3. ");
  });

  it("keeps the ) delimiter style", () => {
    expect(atEnd("1) first")!.value).toBe("1) first\n2) ");
  });

  it("carries a checkbox as a fresh unchecked box", () => {
    expect(atEnd("- [x] done")!.value).toBe("- [x] done\n- [ ] ");
  });

  it("exits the list when the current item is empty", () => {
    const r = atEnd("1. done\n2. ");
    expect(r).not.toBeNull();
    expect(r!.value).toBe("1. done\n");
    expect(r!.caret).toBe("1. done\n".length);
  });

  it("returns null for a non-list line (normal newline)", () => {
    expect(atEnd("just a sentence")).toBeNull();
  });
});
