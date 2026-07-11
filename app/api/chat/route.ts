import { streamText, type CoreMessage } from "ai";
import { z, ZodError } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  getChatModel,
  resolveUsableChatModelId,
  supportsTemperature,
  fallbackChatModelIds,
} from "@/lib/ai/providers";
import { resolveRoutedChatModelId } from "@/lib/ai/routing";
import { buildSystemPrompt, renderRetrievedContext, type ChatMode } from "@/lib/ai/prompts";
import { retrieveChunks, hasUsableContext } from "@/lib/ai/rag";
import { getContextMemories } from "@/lib/ai/memory";
import { suggestMemoriesFromTurn } from "@/lib/ai/memory-suggest";
import { runResearch } from "@/lib/ai/research";
import { apiError } from "@/lib/api";
import { AppError, configMissing } from "@/lib/errors";
import { logError } from "@/lib/logging/error-log";
import { logGeneration } from "@/lib/logging/telemetry";
import { truncate } from "@/lib/utils";
import { env } from "@/lib/env";
import type { Citation } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const attachmentSchema = z.object({
  kind: z.enum(["image", "document"]),
  name: z.string().max(300),
  text: z.string().max(24000).optional(),
  dataUrl: z
    .string()
    .max(15_000_000)
    .regex(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/, "Unsupported image data.")
    .optional(),
});

const bodySchema = z.object({
  conversationId: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? undefined : v)),
  projectId: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (!v ? null : v)),
  mode: z.enum(["general", "knowledge", "research", "report", "improve", "code"]),
  message: z.string().min(1).max(20000),
  attachments: z.array(attachmentSchema).max(6).optional(),
});

export async function POST(req: Request) {
  const started = Date.now();
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  try {
    ctx = await requireSessionApi();
    rateLimit("chat", ctx.userId);
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new AppError({
        area: "chat",
        category: "validation",
        userMessage: parsed.error.issues[0]?.message || "Invalid chat request.",
        internal: parsed.error.flatten(),
      });
    }
    const { conversationId, projectId, mode, message, attachments } = parsed.data;

    const supabase = createServerSupabase();

    let modelId = resolveRoutedChatModelId({
      mode,
      message,
      preferred: resolveUsableChatModelId() ?? undefined,
    });
    if (!modelId) throw configMissing("chat", "An LLM provider");

    let convId = conversationId;
    if (!convId) {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          workspace_id: ctx.workspaceId,
          user_id: ctx.userId,
          project_id: projectId ?? null,
          title: truncate(message, 60),
          mode,
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new AppError({
          area: "chat",
          category: "internal",
          userMessage: "Could not start the conversation.",
          internal: error,
        });
      }
      convId = data.id;
    } else {
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", convId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (!data) {
        throw new AppError({
          area: "chat",
          category: "not_found",
          userMessage: "Conversation not found.",
        });
      }
      await supabase.from("conversations").update({ mode }).eq("id", convId);
    }

    await supabase.from("messages").insert({
      conversation_id: convId,
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      role: "user",
      content: message,
    });

    const memories = await getContextMemories(supabase, ctx.workspaceId, projectId ?? null);
    let retrievedContext: string | null = null;
    let citations: Citation[] = [];

    if (mode === "knowledge") {
      const chunks = await retrieveChunks(supabase, message, {
        workspaceId: ctx.workspaceId,
        projectId: projectId ?? null,
        matchCount: 8,
      });
      if (hasUsableContext(chunks)) {
        const rendered = renderRetrievedContext(chunks);
        retrievedContext = rendered.contextBlock;
        citations = rendered.citations;
      } else {
        retrievedContext = "(No relevant passages were found in the user's knowledge base.)";
      }
    } else if (mode === "research") {
      const research = await runResearch(message);
      retrievedContext = research.answer
        ? `Web research results to synthesize and cite:\n${research.answer}`
        : "(No web results were returned.)";
      citations = research.citations;
    }

    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(20);
    const priorMessages = (history ?? [])
      .reverse()
      .filter((m) => m.role !== "system" && String(m.content ?? "").trim().length > 0)
      .slice(-12)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    let projectName: string | null = null;
    let projectInstructions: string | null = null;
    if (projectId) {
      const { data: proj } = await supabase
        .from("projects")
        .select("name, instructions")
        .eq("id", projectId)
        .maybeSingle();
      projectName = proj?.name ?? null;
      projectInstructions = proj?.instructions ?? null;
    }

    const system = buildSystemPrompt({
      mode: mode as ChatMode,
      projectName,
      projectInstructions,
      memories,
      retrievedContext,
    });

    const { data: assistantRow } = await supabase
      .from("messages")
      .insert({
        conversation_id: convId,
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        role: "assistant",
        content: "",
        citations,
      })
      .select("id")
      .single();
    const assistantMessageId = assistantRow?.id;

    const workspaceId = ctx.workspaceId;
    const userId = ctx.userId;

    const modelMessages: CoreMessage[] = priorMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (attachments?.length) {
      const docs = attachments.filter((a) => a.kind === "document" && a.text);
      const imgs = attachments.filter((a) => a.kind === "image" && a.dataUrl);
      const lastUser = modelMessages.map((m) => m.role).lastIndexOf("user");
      if (lastUser >= 0) {
        let text = message;
        for (const d of docs) {
          text += `\n\n[Attached document: ${d.name}]\n${d.text}`;
        }
        if (imgs.length) {
          modelMessages[lastUser] = {
            role: "user",
            content: [
              { type: "text", text },
              ...imgs.map((im) => ({ type: "image" as const, image: im.dataUrl! })),
            ],
          };
        } else {
          modelMessages[lastUser] = { role: "user", content: text };
        }
      }
    }

    const candidates = [modelId, ...fallbackChatModelIds(modelId)];
    let lastErr: unknown = null;
    let result: Awaited<ReturnType<typeof streamText>> | null = null;

    for (const candidate of candidates) {
      try {
        const opts: Parameters<typeof streamText>[0] = {
          model: getChatModel(candidate, "chat"),
          system,
          messages: modelMessages,
          async onFinish({ text, usage }) {
            logGeneration({
              name: "chat",
              model: candidate,
              latencyMs: Date.now() - started,
              workspaceId,
              metadata: { mode },
              usage,
            });
            try {
              if (assistantMessageId) {
                await supabase
                  .from("messages")
                  .update({ content: text, citations })
                  .eq("id", assistantMessageId);
              }
              await supabase
                .from("conversations")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", convId);

              if (env.llmTrainingLogsEnabled) {
                await supabase.from("llm_training_logs").insert({
                  workspace_id: workspaceId,
                  user_id: userId,
                  project_id: projectId ?? null,
                  model_id: candidate,
                  system_prompt: system,
                  messages_json: priorMessages,
                  response_text: text,
                });
              }

              await suggestMemoriesFromTurn({
                supabase,
                workspaceId,
                userId,
                projectId: projectId ?? null,
                userMessage: message,
                assistantMessage: text,
              });
            } catch (e) {
              await logError({ area: "chat", error: e, workspaceId, userId });
            }
          },
        };
        if (supportsTemperature(candidate)) {
          opts.temperature = mode === "code" || mode === "knowledge" ? 0.2 : 0.5;
        }
        result = await streamText(opts);
        modelId = candidate;
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await logError({
          area: "chat",
          error: e,
          workspaceId,
          userId,
          provider: candidate.split(":")[0],
        });
      }
    }

    if (!result) {
      throw new AppError({
        area: "chat",
        category: "provider_error",
        userMessage: friendlyProviderError(lastErr),
        internal: lastErr,
      });
    }

    const response = result.toTextStreamResponse();
    const headers = new Headers(response.headers);
    headers.set("x-aria-conversation-id", convId!);
    if (assistantMessageId) headers.set("x-aria-message-id", assistantMessageId);
    if (citations.length) {
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(citations))));
      headers.set("x-aria-citations", b64);
    }
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError(
        new AppError({
          area: "chat",
          category: "validation",
          userMessage: error.issues[0]?.message || "Invalid chat request.",
        }),
        {
          area: "chat",
          workspaceId: ctx?.workspaceId,
          userId: ctx?.userId,
          latencyMs: Date.now() - started,
        },
      );
    }
    return apiError(error, {
      area: "chat",
      workspaceId: ctx?.workspaceId,
      userId: ctx?.userId,
      latencyMs: Date.now() - started,
    });
  }
}

function friendlyProviderError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/429|rate limit|quota/i.test(msg)) {
    return "The AI provider is rate-limiting requests. Wait a moment, or check your OpenAI/Google quota.";
  }
  if (/401|incorrect api key|invalid api key/i.test(msg)) {
    return "The AI API key looks invalid. Check OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY on Vercel.";
  }
  if (/model|not found|does not exist/i.test(msg)) {
    return "The selected chat model is unavailable. Try changing DEFAULT_CHAT_MODEL.";
  }
  if (/temperature/i.test(msg)) {
    return "This model rejected the request options. Retry — Aria will use a compatible setup.";
  }
  return "The assistant could not respond. Check your LLM API keys and try again.";
}
