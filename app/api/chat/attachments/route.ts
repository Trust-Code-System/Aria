import { requireSessionApi } from "@/lib/auth/guards";
import { apiError, apiOk } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { validateFile, sanitizeFilename } from "@/lib/security/sanitize";
import { extractText } from "@/lib/ingestion/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Chat attachment handler for DOCUMENTS. Extracts text so the model can read the
 * file inline for this turn, WITHOUT persisting it to the knowledge base (that's
 * what /api/upload is for). Images are handled entirely client-side (data URLs)
 * and passed to /api/chat directly, so they never hit this endpoint.
 */
const MAX_DOC_CHARS = 20_000;

export async function POST(req: Request) {
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new AppError({ area: "chat", category: "validation", userMessage: "No file was provided." });
    }
    const check = validateFile({ name: file.name, size: file.size, type: file.type });
    if (!check.ok) {
      throw new AppError({ area: "chat", category: "validation", userMessage: check.reason! });
    }

    const safeName = sanitizeFilename(file.name);
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await extractText(bytes, safeName, file.type);

    if (result.status === "failed") {
      throw new AppError({
        area: "chat",
        category: "validation",
        userMessage: `Could not read "${safeName}". ${result.detail ?? ""}`.trim(),
      });
    }
    if (result.status === "empty" || !result.text.trim()) {
      throw new AppError({
        area: "chat",
        category: "validation",
        userMessage: `"${safeName}" appears to be empty or has no extractable text.`,
      });
    }

    const truncated = result.text.length > MAX_DOC_CHARS;
    const text = truncated ? result.text.slice(0, MAX_DOC_CHARS) : result.text;

    return apiOk({
      kind: "document" as const,
      name: safeName,
      text,
      chars: result.text.length,
      truncated,
    });
  } catch (error) {
    return apiError(error, { area: "chat", workspaceId: ctx?.workspaceId, userId: ctx?.userId });
  }
}
