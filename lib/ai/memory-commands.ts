export type ExplicitMemoryCommand =
  | { kind: "save"; content: string; update: boolean }
  | { kind: "save_reference" }
  | { kind: "forget"; query: string }
  | { kind: "recall" }
  | { kind: "extract_attachment" };

/** Trailing text that carries no fact of its own — it just names the memory
 * store ("save this TO MEMORY") or points at earlier content ("save THIS"). */
const FILLER_ONLY_RE =
  /^(?:to|in|into|for)?\s*(?:my\s+)?(?:memory|mind|later|reference|this|that|it)$/i;

const clean = (value: string) =>
  value
    .trim()
    .replace(/^that\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();

/** Deterministic recognition for explicit memory operations. */
export function recognizeMemoryCommand(
  message: string,
  hasAttachments = false,
): ExplicitMemoryCommand | null {
  const text = message.trim();
  if (!text) return null;

  if (
    hasAttachments &&
    /\b(remember|save|store|learn)\b/i.test(text) &&
    /\b(this|attachment|document|cv|resume|file)\b/i.test(text)
  ) {
    return { kind: "extract_attachment" };
  }

  if (/^(what do you remember about me|show (me )?what you remember|list my memories)\??$/i.test(text)) {
    return { kind: "recall" };
  }

  const forget = text.match(
    /^(?:please\s+)?(?:forget|delete(?: this)? (?:from )?memory|remove(?: this)? (?:from )?memory)\s+(.+)$/i,
  );
  if (forget) return { kind: "forget", query: clean(forget[1]) };

  const genericUpdate = text.match(
    /^(?:please\s+)?update (?:my )?memory(?: to|:)?\s+(.+)$/i,
  );
  if (genericUpdate) return { kind: "save", content: clean(genericUpdate[1]), update: true };

  const fieldUpdate = text.match(
    /^(?:please\s+)?change my (preference|company(?: name)?|name|role|signature) to\s+(.+)$/i,
  );
  if (fieldUpdate) {
    const prefix: Record<string, string> = {
      preference: "I prefer",
      company: "My company is",
      "company name": "My company is",
      name: "My name is",
      role: "My role is",
      signature: "My signature is",
    };
    return {
      kind: "save",
      content: `${prefix[fieldUpdate[1].toLowerCase()] ?? "My preference is"} ${clean(fieldUpdate[2])}`,
      update: true,
    };
  }

  // Referential save: "save this to memory", "remember this", "save that",
  // "keep this in mind" — no inline fact, so the referent is the recent turn.
  const reference = text.match(
    /^(?:please\s+)?(?:remember|save|store|keep|add|note)\s+(?:this|that)(?:\s+(?:to|in|into|for)\s+(?:my\s+)?(?:memory|mind|later|reference))?\s*$/i,
  );
  if (reference) return { kind: "save_reference" };

  const save = text.match(
    /^(?:please\s+)?(?:remember(?: that)?|add (?:this|that) to memory|save (?:this|that)(?: as (?:a )?(?:preference|memory))?|store (?:this|that)|keep (?:this|that) in mind|learn this about me)\s*[:,-]?\s*(.+)$/i,
  );
  if (!save) return null;
  const content = clean(save[1]);
  if (!content) return null;
  // Backstop: the captured tail is pure filler ("...to memory") — the user is
  // pointing at earlier content, not stating a new fact inline.
  if (FILLER_ONLY_RE.test(content)) return { kind: "save_reference" };
  return { kind: "save", content, update: false };
}

export function looksLikeDurablePersonalStatement(message: string): boolean {
  const text = message.trim();
  if (text.length < 5 || text.length > 800) return false;
  return /^(?:my name is|i (?:generally )?prefer|for (?:codex|grok|claude|chatgpt),? use|.+ is my (?:company|business|development company)|my (?:company|role|timezone|signature) is)\b/i.test(
    text,
  );
}
