/**
 * Markdown list auto-continuation for a textarea — the behaviour you see in the
 * Claude/Notion editors: type `1.` then start a new line and `2.` appears; type
 * `- ` and the next line starts with `- `. An empty list item exits the list.
 *
 * Pure/testable: give it the current value + caret, get back the next value +
 * caret, or `null` when the current line isn't a list item (caller should fall
 * through to inserting a normal newline).
 */

export interface ContinuationResult {
  value: string;
  /** New caret position (selectionStart === selectionEnd). */
  caret: number;
}

// Ordered:  "  1. "  |  "2) "     Unordered:  "- "  "* "  "+ "     Checkbox: "- [ ] "
const ORDERED = /^(\s*)(\d+)([.)])(\s+)(.*)$/;
const UNORDERED = /^(\s*)([-*+])(\s+)(\[[ xX]\]\s+)?(.*)$/;

/**
 * Compute the result of pressing Enter/newline inside a list.
 * @param value  full textarea value
 * @param caret  selectionStart (assumes collapsed selection)
 * @returns next {value, caret}, or null if not on a list line.
 */
export function continueList(value: string, caret: number): ContinuationResult | null {
  // Isolate the current line (from the previous newline to the caret).
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const line = value.slice(lineStart, caret);

  const ordered = line.match(ORDERED);
  const unordered = !ordered ? line.match(UNORDERED) : null;
  const m = ordered ?? unordered;
  if (!m) return null;

  const indent = m[1];
  const content = (ordered ? m[5] : m[5]) ?? "";

  // Empty item ("1. " with nothing after) → exit the list: clear the marker.
  if (content.trim() === "") {
    const next = value.slice(0, lineStart) + value.slice(caret);
    return { value: next, caret: lineStart };
  }

  let marker: string;
  if (ordered) {
    const num = parseInt(ordered[2], 10) + 1;
    marker = `${indent}${num}${ordered[3]}${ordered[4]}`;
  } else {
    // Preserve a checkbox pattern as an unchecked box; otherwise the bullet char.
    const box = unordered![4] ? "[ ] " : "";
    marker = `${indent}${unordered![2]}${unordered![3]}${box}`;
  }

  const insert = "\n" + marker;
  const next = value.slice(0, caret) + insert + value.slice(caret);
  return { value: next, caret: caret + insert.length };
}
