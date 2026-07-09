/**
 * Sanitization helpers. Two goals:
 *  1. Make user-supplied input safe (filenames, file types, sizes).
 *  2. Strip secrets / PII from anything that gets written to the admin logs.
 */

import { env } from "@/lib/env";

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "txt",
  "md",
  "markdown",
  "docx",
  "csv",
  "json",
]);

const ALLOWED_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream", // some browsers send this for .md
]);

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  // Keep letters, numbers, dot, dash, underscore, space; collapse the rest.
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || "file";
}

export function getExtension(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

export function validateFile(file: { name: string; size: number; type: string }): {
  ok: boolean;
  reason?: string;
} {
  const ext = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `Unsupported file type ".${ext}".` };
  }
  if (file.type && !ALLOWED_MIME.has(file.type) && !ext) {
    return { ok: false, reason: `Unsupported content type "${file.type}".` };
  }
  const maxBytes = env.maxUploadMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return { ok: false, reason: `File exceeds the ${env.maxUploadMb}MB limit.` };
  }
  if (file.size === 0) {
    return { ok: false, reason: "File is empty." };
  }
  return { ok: true };
}

// Patterns that must never reach the logs.
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9-_]{16,}/g, // OpenAI-style keys
  /(?:xox[baprs]-)[A-Za-z0-9-]{10,}/g, // Slack tokens
  /AKIA[0-9A-Z]{16}/g, // AWS access key ids
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
  /Bearer\s+[A-Za-z0-9._-]{16,}/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // emails
];

/**
 * Produce a log-safe version of an error message: strips secrets/PII and
 * truncates. Never include raw document content or full user prompts here.
 */
export function sanitizeForLog(input: unknown, max = 500): string {
  let text =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : safeStringify(input);

  for (const p of SECRET_PATTERNS) {
    text = text.replace(p, "[redacted]");
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, max);
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
