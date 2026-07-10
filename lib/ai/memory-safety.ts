/** Shared memory safety helpers (secret detection). */

export const SECRET_PATTERN =
  /(password|api[\s_-]*key|secret|token|ssn|credit\s?card|cvv|private[\s_-]*key|bearer\s+[a-z0-9])/i;

export function looksLikeSecret(content: string): boolean {
  return SECRET_PATTERN.test(content);
}
