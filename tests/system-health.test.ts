import { describe, expect, it } from "vitest";

import {
  MEMORY_ERROR_WINDOW_MS,
  memoryErrorsCheck,
} from "@/lib/admin/system-health";

describe("memoryErrorsCheck", () => {
  it("returns null when there are no recent memory errors", () => {
    expect(memoryErrorsCheck(0)).toBeNull();
    expect(memoryErrorsCheck(-1)).toBeNull();
  });

  it("warns and reports the count when memory errors were logged", () => {
    const check = memoryErrorsCheck(3);
    expect(check).not.toBeNull();
    expect(check).toMatchObject({ name: "Memory pipeline errors", level: "warning" });
    expect(check?.detail).toContain("3");
    // Names the source table so an operator can drill in.
    expect(check?.detail).toContain("feature_area = 'memory'");
  });

  it("reflects the window length in hours", () => {
    expect(memoryErrorsCheck(1)?.detail).toContain("24h");
    expect(memoryErrorsCheck(1, 2 * 3_600_000)?.detail).toContain("2h");
  });

  it("defaults to a 24h window", () => {
    expect(MEMORY_ERROR_WINDOW_MS).toBe(24 * 60 * 60_000);
  });
});
