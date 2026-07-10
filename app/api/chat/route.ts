import { streamText, type CoreMessage } from "ai";
import { z } from "zod";
import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { getChatModel, resolveUsableChatModelId } from "@/lib/ai/providers";
import { resolveRoutedChatModelId } from "@/lib/ai/routing";
import { buildSystemPrompt, renderRetrievedContext, type ChatMode } from "@/lib/ai/prompts";
import { retrieveChunks, hasUsableContext } from "@/lib/ai/rag";
import { getContextMemories } from "@/lib/ai/memory";
import { suggestMemoriesFromTurn } from "@/lib/ai/memory-suggest";
import { runResearch } from "@/lib/ai/research";
import { apiError } from "@/lib/api";
import { AppError, configMissing } from "@/lib/errors";
import { logError } from "@/lib/logging/error-log";
import { truncate } from "@/lib/utils";
import { env } from "@/lib/env";
import type { Citation } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Chat attachments for the current turn. Documents arrive as pre-extracted text
// (see /api/chat/attachments); images arrive as base64 data URLs from the client.
const attachmentSchema = z.object({
  kind: z.enum(["image", "document"]),
  name: z.string().max(300),
  text: z.string().max(24000).optional(), // documents
  dataUrl: z
    .string()
    .max(15_000_000)
    .regex(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/, "Unsupported image data.")
    .optional(), // images
});

const bodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
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
    const json = await req.json();
    const { conversationId, projectId, mode, message, attachments } = bodySchema.parse(json);

    const supabase = createServerSupabase();

    const modelId = resolveRoutedChatModelId({
      mode,
      message,
      preferred: resolveUsableChatModelId() ?? undefined,
    });
    if (!modelId) throw configMissing("chat", "An LLM provider");

    // 1. Resolve or create the conversation.
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
      if (error || !data)
        throw new AppError({
          area: "chat",
          category: "internal",
          userMessage: "Could not start the conversation.",
          internal: error,
        });
      convId = data.id;
    } else {
      // Verify ownership (RLS also enforces this).
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", convId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      if (!data) throw new AppError({ area: "chat", category: "not_found", userMessage: "Conversation not found." });
      await supabase.from("conversations").update({ mode }).eq("id", convId);
    }

    // 2. Persist the user message.
    await supabase.from("messages").insert({
      conversation_id: convId,
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      role: "user",
      content: message,
    });

    // 3. Gather context: memories, plus RAG / research per mode.
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

    // 4. Load recent conversation history for continuity.
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(12);
    const priorMessages = (history ?? [])
      .reverse()
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // 5. Build the project context.
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

    // 6. Pre-insert the assistant message row so we have an id to return, then
    //    stream and persist the final content on finish.
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

    // 6b. Fold this turn's attachments into the latest user message: document text
    //     inline as context, images as multimodal parts (models are vision-capable).
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

    const result = await streamText({
      model: getChatModel(modelId, "chat"),
      system,
      messages: modelMessages,
      temperature: mode === "code" || mode === "knowledge" ? 0.2 : 0.5,
      async onFinish({ text }) {
        try {
          if (assistantMessageId) {
            await supabase
              .from("messages")
              .update({ content: text, citations })
              .eq("id", assistantMessageId);
          }
          await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

          // Continuous Distillation: opt-in only (LLM_TRAINING_LOGS_ENABLED).
          if (env.llmTrainingLogsEnabled) {
            await supabase.from("llm_training_logs").insert({
              workspace_id: workspaceId,
              user_id: userId,
              project_id: projectId ?? null,
              model_id: modelId,
              system_prompt: system,
              messages_json: priorMessages,
              response_text: text,
            });
          }

          // Auto-suggest memories (status=suggested) — never auto-approve.
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
    });

    // 7. Stream response with metadata headers computed above.
    const response = result.toTextStreamResponse();
    const headers = new Headers(response.headers);
    headers.set("x-aria-conversation-id", convId!);
    if (assistantMessageId) headers.set("x-aria-message-id", assistantMessageId);
    if (citations.length) {
      // base64(utf-8 JSON) so header stays ASCII-safe.
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(citations))));
      headers.set("x-aria-citations", b64);
    }
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    return apiError(error, {
      area: "chat",
      workspaceId: ctx?.workspaceId,
      userId: ctx?.userId,
      latencyMs: Date.now() - started,
    });
  }
}
