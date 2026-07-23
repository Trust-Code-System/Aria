import { streamText, type CoreMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z, ZodError } from "zod";

import { requireSessionApi } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  fallbackChatModelIds,
  getChatModel,
  isModelCompatible,
  resolveUsableChatModelId,
  resolveTemperature,
} from "@/lib/ai/providers";
import { resolveRoutedChatModelId } from "@/lib/ai/routing";
import { buildSystemPrompt, renderRetrievedContext, type ChatMode } from "@/lib/ai/prompts";
import { retrieveChunks, hasUsableContext } from "@/lib/ai/rag";
import { getContextMemories } from "@/lib/ai/memory";
import { suggestMemoriesFromTurn } from "@/lib/ai/memory-suggest";
import { executeExplicitMemoryCommand } from "@/lib/ai/memory-actions";
import { recognizeMemoryCommand } from "@/lib/ai/memory-commands";
import { getCoreProfile, renderCoreProfile } from "@/lib/ai/core-profile";
import { searchChatHistory } from "@/lib/ai/history-search";
import { runResearch } from "@/lib/ai/research";
import { apiError } from "@/lib/api";
import { AppError, configMissing } from "@/lib/errors";
import { logError } from "@/lib/logging/error-log";
import { logGeneration } from "@/lib/logging/telemetry";
import { newTraceId, truncate } from "@/lib/utils";
import { env } from "@/lib/env";
import type { Citation } from "@/lib/ai/types";
import {
  classifyChatIntent,
  intentNeedsMemories,
  intentNeedsMemorySuggest,
  intentNeedsTools,
} from "@/lib/orchestration/intent";
import { buildChatTools, formatCapabilityPromptSection } from "@/lib/connectors/registry";
import { buildModelHistory, classifyTerminalError } from "@/lib/chat/turn-state";
import {
  encodeChatStreamEvent,
  type ChatStreamEvent,
} from "@/lib/chat/stream-protocol";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TOOL_CALLS = 8;
const MAX_AGENT_STEPS = 5;
const TURN_TIMEOUT_MS = 55_000;
const MAX_HISTORY_CHARS = 48_000;

const attachmentSchema = z.object({
  kind: z.enum(["image", "document"]),
  name: z.string().max(300),
  text: z.string().max(24_000).optional(),
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
    .transform((value) => (!value ? undefined : value)),
  projectId: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .optional()
    .transform((value) => (!value ? null : value)),
  mode: z.enum(["general", "knowledge", "research", "report", "improve", "code"]),
  message: z.string().min(1).max(20_000),
  idempotencyKey: z.string().uuid(),
  retryAssistantMessageId: z.string().uuid().optional(),
  attachments: z.array(attachmentSchema).max(6).optional(),
});

type ParsedBody = z.infer<typeof bodySchema>;

interface StartedTurn {
  userMessageId: string;
  assistantMessageId: string;
  message: string;
  duplicateStatus?: string;
  duplicateContent?: string;
}

export async function POST(req: Request) {
  const started = Date.now();
  let ctx: Awaited<ReturnType<typeof requireSessionApi>> | null = null;
  let supabase: SupabaseClient | null = null;
  let assistantMessageId: string | null = null;
  let conversationId: string | null = null;

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
    const body = parsed.data;
    supabase = createServerSupabase();
    conversationId = await resolveConversation(supabase, ctx, body);

    const turn = await startTurn(supabase, ctx, conversationId, body);
    assistantMessageId = turn.assistantMessageId;
    if (turn.duplicateStatus) {
      if (turn.duplicateStatus === "completed") {
        return completedReplayResponse(
          conversationId,
          turn.assistantMessageId,
          body.idempotencyKey,
          turn.duplicateContent ?? "",
        );
      }
      throw new AppError({
        area: "chat",
        category: "validation",
        statusCode: 409,
        userMessage:
          turn.duplicateStatus === "failed" || turn.duplicateStatus === "cancelled"
            ? "This turn already failed. Use Retry so Aria can reuse the original user message safely."
            : "This turn is already running. Please wait for it to finish.",
      });
    }

    const intent = classifyChatIntent({
      mode: body.mode,
      message: turn.message,
      hasAttachments: Boolean(body.attachments?.length),
    });
    const explicitMemory = recognizeMemoryCommand(
      turn.message,
      Boolean(body.attachments?.length),
    );

    if (explicitMemory) {
      const attachmentText = body.attachments
        ?.filter((item) => item.kind === "document" && item.text)
        .map((item) => `[${item.name}]\n${item.text}`)
        .join("\n\n");
      // A referential "save this to memory" points at the most recent assistant
      // reply; resolve it here so the save stores the real content, not "this".
      let referenceText: string | undefined;
      if (explicitMemory.kind === "save_reference") {
        const { data: prior } = await supabase
          .from("messages")
          .select("content")
          .eq("conversation_id", conversationId)
          .eq("role", "assistant")
          .eq("status", "completed")
          .neq("id", assistantMessageId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        referenceText = prior?.content?.trim() || undefined;
      }
      const memoryResult = await executeExplicitMemoryCommand({
        supabase,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        projectId: body.projectId ?? null,
        turnId: body.idempotencyKey,
        sourceMessageId: turn.userMessageId,
        command: explicitMemory,
        userMessage: turn.message,
        attachmentText,
        referenceText,
      });
      await completeAssistantMessage({
        supabase,
        assistantMessageId,
        content: memoryResult.text,
        events: memoryResult.events,
        citations: [],
      });
      for (const event of memoryResult.events) {
        await persistMessageEvent({
          supabase,
          event,
          messageId: assistantMessageId,
          conversationId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
        });
      }
      return eventListResponse({
        conversationId,
        messageId: assistantMessageId,
        turnId: body.idempotencyKey,
        text: memoryResult.text,
        events: memoryResult.events,
      });
    }

    const hasImages = Boolean(body.attachments?.some((item) => item.kind === "image"));
    let modelId = resolveRoutedChatModelId({
      mode: body.mode,
      message: turn.message,
      preferred: resolveUsableChatModelId() ?? undefined,
      intent,
      hasImages,
    });
    if (!modelId) throw configMissing("chat", "A compatible LLM provider/model");

    const coreProfile = await getCoreProfile(supabase, ctx.userId);
    const memories = intentNeedsMemories(intent)
      ? await getContextMemories(
          supabase,
          ctx.workspaceId,
          body.projectId ?? null,
          turn.message,
        )
      : [];

    let retrievedContext: string | null = null;
    let citations: Citation[] = [];
    if (body.mode === "knowledge") {
      const chunks = await retrieveChunks(supabase, turn.message, {
        workspaceId: ctx.workspaceId,
        projectId: body.projectId ?? null,
        matchCount: 8,
      });
      if (hasUsableContext(chunks)) {
        const rendered = renderRetrievedContext(chunks);
        retrievedContext = rendered.contextBlock;
        citations = rendered.citations;
      } else {
        retrievedContext = "(No relevant passages were found in the user's knowledge base.)";
      }
    } else if (body.mode === "research") {
      const research = await runResearch(turn.message);
      retrievedContext = research.answer
        ? `Web research results to synthesize and cite:\n${research.answer}`
        : "(No web results were returned.)";
      citations = research.citations;
    }

    const historyLimit = intent === "instant" ? 4 : 28;
    const { data: historyRows } = await supabase
      .from("messages")
      .select("id, role, content, status, idempotency_key")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(80);
    const modelHistory = trimHistory(
      buildModelHistory((historyRows ?? []).reverse(), { limit: historyLimit }),
    );

    const historyContext = await searchChatHistory({
      supabase,
      workspaceId: ctx.workspaceId,
      currentConversationId: conversationId,
      message: turn.message,
      enabled: coreProfile.historyRetrievalEnabled,
    });

    let projectName: string | null = null;
    let projectInstructions: string | null = null;
    if (body.projectId && intent !== "instant") {
      const { data: project } = await supabase
        .from("projects")
        .select("name, instructions")
        .eq("id", body.projectId)
        .eq("workspace_id", ctx.workspaceId)
        .maybeSingle();
      projectName = project?.name ?? null;
      projectInstructions = project?.instructions ?? null;
    }

    let connectionCapabilities: string | null = null;
    let chatTools: Awaited<ReturnType<typeof buildChatTools>> | null = null;
    const loadTools = env.chatToolsEnabled && intentNeedsTools(intent) && body.mode !== "knowledge";
    if (loadTools) {
      chatTools = await buildChatTools({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        conversationId,
        assistantMessageId,
        supabase,
        intent,
        message: turn.message,
      });
      connectionCapabilities = formatCapabilityPromptSection(
        chatTools.capabilityLines,
        chatTools.composioToolNames,
      );
    }

    const system = buildSystemPrompt({
      mode: body.mode as ChatMode,
      projectName,
      projectInstructions,
      memories,
      retrievedContext,
      historyContext,
      coreProfile: renderCoreProfile(coreProfile),
      connectionCapabilities,
      compact: intent === "instant",
    });

    const modelMessages = applyAttachments(modelHistory, turn.message, body.attachments);
    const requiresTools = Boolean(chatTools && Object.keys(chatTools.tools).length);
    const candidates = [
      modelId,
      ...fallbackChatModelIds(modelId, {
        streaming: true,
        tools: requiresTools,
        images: hasImages,
      }),
    ].filter(
      (candidate, index, all) =>
        all.indexOf(candidate) === index &&
        isModelCompatible(candidate, {
          streaming: true,
          tools: requiresTools,
          images: hasImages,
        }),
    );
    if (!candidates.length) {
      throw new AppError({
        area: "chat",
        category: "config_missing",
        userMessage: requiresTools
          ? "No configured model supports connected-app tools for this request. Nothing was sent."
          : "No compatible configured model is available for this request.",
      });
    }

    await supabase
      .from("messages")
      .update({ status: "streaming", started_at: new Date().toISOString() })
      .eq("id", assistantMessageId)
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "pending");

    modelId = candidates[0];
    return createAgentStreamResponse({
      req,
      started,
      supabase,
      ctx,
      body,
      intent,
      conversationId,
      assistantMessageId,
      userMessageId: turn.userMessageId,
      candidates,
      system,
      modelMessages,
      chatTools,
      citations,
    });
  } catch (error) {
    const traceId = newTraceId();
    if (supabase && assistantMessageId && ctx) {
      const terminal = classifyTerminalError(error, req.signal.aborted);
      const userMessage = error instanceof AppError ? error.userMessage : terminal.userMessage;
      await supabase
        .from("messages")
        .update({
          status: terminal.status,
          content: userMessage,
          error_code: error instanceof AppError ? error.category : terminal.code,
          error_message: userMessage,
          trace_id: traceId,
          completed_at: new Date().toISOString(),
          cancelled_at: terminal.status === "cancelled" ? new Date().toISOString() : null,
        })
        .eq("id", assistantMessageId)
        .eq("workspace_id", ctx.workspaceId)
        .in("status", ["pending", "streaming"]);
    }
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
          traceId,
        },
      );
    }
    return apiError(error, {
      area: "chat",
      workspaceId: ctx?.workspaceId,
      userId: ctx?.userId,
      latencyMs: Date.now() - started,
      traceId,
    });
  }
}

async function resolveConversation(
  supabase: SupabaseClient,
  ctx: Awaited<ReturnType<typeof requireSessionApi>>,
  body: ParsedBody,
): Promise<string> {
  if (body.conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", body.conversationId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (!data) throw new AppError({ area: "chat", category: "not_found", userMessage: "Conversation not found." });
    await supabase
      .from("conversations")
      .update({ mode: body.mode })
      .eq("id", body.conversationId)
      .eq("workspace_id", ctx.workspaceId);
    return body.conversationId;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      project_id: body.projectId ?? null,
      title: truncate(body.message, 60),
      mode: body.mode,
      initial_request_id: body.idempotencyKey,
    })
    .select("id")
    .single();
  if (data?.id) return data.id;
  if (error?.code === "23505") {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", ctx.userId)
      .eq("initial_request_id", body.idempotencyKey)
      .maybeSingle();
    if (existing?.id) return existing.id;
  }
  throw new AppError({
    area: "chat",
    category: "internal",
    userMessage: "Could not start the conversation.",
    internal: error,
  });
}

async function startTurn(
  supabase: SupabaseClient,
  ctx: Awaited<ReturnType<typeof requireSessionApi>>,
  conversationId: string,
  body: ParsedBody,
): Promise<StartedTurn> {
  if (body.retryAssistantMessageId) {
    const { data: assistant } = await supabase
      .from("messages")
      .select("id, status, parent_message_id")
      .eq("id", body.retryAssistantMessageId)
      .eq("conversation_id", conversationId)
      .eq("workspace_id", ctx.workspaceId)
      .eq("role", "assistant")
      .maybeSingle();
    if (!assistant || !["failed", "cancelled"].includes(assistant.status) || !assistant.parent_message_id) {
      throw new AppError({
        area: "chat",
        category: "validation",
        userMessage: "Only a failed or cancelled assistant turn can be retried.",
      });
    }
    const { data: user } = await supabase
      .from("messages")
      .select("id, content")
      .eq("id", assistant.parent_message_id)
      .eq("conversation_id", conversationId)
      .eq("workspace_id", ctx.workspaceId)
      .eq("role", "user")
      .maybeSingle();
    if (!user) throw new AppError({ area: "chat", category: "not_found", userMessage: "The original user turn was not found." });
    const { data: reset, error } = await supabase
      .from("messages")
      .update({
        status: "pending",
        content: "",
        error_code: null,
        error_message: null,
        trace_id: null,
        idempotency_key: body.idempotencyKey,
        started_at: null,
        completed_at: null,
        cancelled_at: null,
        metadata: { stream_version: 1, events: [], retry: true },
      })
      .eq("id", assistant.id)
      .eq("workspace_id", ctx.workspaceId)
      .in("status", ["failed", "cancelled"])
      .select("id")
      .maybeSingle();
    if (error || !reset) {
      throw new AppError({
        area: "chat",
        category: "validation",
        userMessage: "This turn was already retried in another request.",
        internal: error,
      });
    }
    return { userMessageId: user.id, assistantMessageId: assistant.id, message: user.content };
  }

  const userInsert = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      role: "user",
      content: body.message,
      status: "completed",
      idempotency_key: body.idempotencyKey,
      completed_at: new Date().toISOString(),
      metadata: {
        attachment_names: body.attachments?.map((item) => item.name) ?? [],
      },
    })
    .select("id")
    .single();

  let userMessageId = userInsert.data?.id as string | undefined;
  if (!userMessageId && userInsert.error?.code === "23505") {
    const { data: existingUser } = await supabase
      .from("messages")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("user_id", ctx.userId)
      .eq("idempotency_key", body.idempotencyKey)
      .eq("role", "user")
      .maybeSingle();
    userMessageId = existingUser?.id;
  }
  if (!userMessageId) {
    throw new AppError({
      area: "chat",
      category: "internal",
      userMessage: "Could not save your message.",
      internal: userInsert.error,
    });
  }

  const { data: existingAssistant } = await supabase
    .from("messages")
    .select("id, status, content")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .eq("idempotency_key", body.idempotencyKey)
    .eq("role", "assistant")
    .maybeSingle();
  if (existingAssistant) {
    return {
      userMessageId,
      assistantMessageId: existingAssistant.id,
      message: body.message,
      duplicateStatus: existingAssistant.status,
      duplicateContent: existingAssistant.content,
    };
  }

  const { data: assistant, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      role: "assistant",
      content: "",
      status: "pending",
      idempotency_key: body.idempotencyKey,
      parent_message_id: userMessageId,
      metadata: { stream_version: 1, events: [] },
    })
    .select("id")
    .single();
  if (error || !assistant) {
    throw new AppError({
      area: "chat",
      category: "internal",
      userMessage: "Could not prepare the assistant turn.",
      internal: error,
    });
  }
  return { userMessageId, assistantMessageId: assistant.id, message: body.message };
}

function trimHistory(messages: Array<{ role: "user" | "assistant"; content: string }>): CoreMessage[] {
  const output: Array<{ role: "user" | "assistant"; content: string }> = [];
  let chars = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    const content = item.content.slice(0, 8_000);
    if (chars + content.length > MAX_HISTORY_CHARS && output.length) break;
    output.unshift({ ...item, content });
    chars += content.length;
  }
  return output;
}

function applyAttachments(
  messages: CoreMessage[],
  currentMessage: string,
  attachments: ParsedBody["attachments"],
): CoreMessage[] {
  if (!attachments?.length) return messages;
  const result = [...messages];
  const documents = attachments.filter((item) => item.kind === "document" && item.text);
  const images = attachments.filter((item) => item.kind === "image" && item.dataUrl);
  const lastUser = result.map((item) => item.role).lastIndexOf("user");
  if (lastUser < 0) return result;
  let text = currentMessage;
  for (const document of documents) text += `\n\n[Attached document: ${document.name}]\n${document.text}`;
  result[lastUser] = images.length
    ? {
        role: "user",
        content: [
          { type: "text", text },
          ...images.map((image) => ({ type: "image" as const, image: image.dataUrl! })),
        ],
      }
    : { role: "user", content: text };
  return result;
}

function createAgentStreamResponse(params: {
  req: Request;
  started: number;
  supabase: SupabaseClient;
  ctx: Awaited<ReturnType<typeof requireSessionApi>>;
  body: ParsedBody;
  intent: ReturnType<typeof classifyChatIntent>;
  conversationId: string;
  assistantMessageId: string;
  userMessageId: string;
  candidates: string[];
  system: string;
  modelMessages: CoreMessage[];
  chatTools: Awaited<ReturnType<typeof buildChatTools>> | null;
  citations: Citation[];
}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void runAgentStream(params, controller);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: responseHeaders(params.conversationId, params.assistantMessageId, params.citations),
  });
}

async function runAgentStream(
  params: Parameters<typeof createAgentStreamResponse>[0],
  controller: ReadableStreamDefaultController<Uint8Array>,
) {
  const safeEnqueue = (event: ChatStreamEvent) => {
    try {
      controller.enqueue(encodeChatStreamEvent(event));
    } catch {
      // The client disconnected; persistence still completes below.
    }
  };
  safeEnqueue({
    type: "turn_started",
    turnId: params.body.idempotencyKey,
    conversationId: params.conversationId,
    messageId: params.assistantMessageId,
  });

  let accumulated = "";
  let lastError: unknown = null;
  let selectedModel = params.candidates[0];
  let emittedProviderOutput = false;
  let toolActivity = false;
  let toolCalls = 0;
  const uiEvents: ChatStreamEvent[] = [];

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("Chat request timed out.")), TURN_TIMEOUT_MS);
  const abortFromRequest = () => timeout.abort(new DOMException("Client disconnected", "AbortError"));
  params.req.signal.addEventListener("abort", abortFromRequest, { once: true });

  try {
    for (const candidate of params.candidates) {
      selectedModel = candidate;
      try {
        const options: Parameters<typeof streamText>[0] = {
          model: getChatModel(candidate, "chat"),
          system: params.system,
          messages: params.modelMessages,
          maxSteps:
            params.chatTools && Object.keys(params.chatTools.tools).length
              ? MAX_AGENT_STEPS
              : 1,
          maxRetries: 0,
          abortSignal: timeout.signal,
        };
        if (params.chatTools && Object.keys(params.chatTools.tools).length) {
          options.tools = params.chatTools.tools;
          options.toolChoice = "auto";
        }
        // Always set an accepted temperature: this SDK forces 0 when omitted,
        // which extended-thinking models reject. resolveTemperature returns our
        // desired value for models that accept it, else their required default 1.
        options.temperature = resolveTemperature(
          candidate,
          params.body.mode === "code" || params.body.mode === "knowledge" ? 0.2 : 0.5,
        );

        const result = await streamText(options);
        for await (const rawPart of result.fullStream) {
          // Dynamic tool maps erase the tool-result discriminant in this SDK's
          // generic inference even though the runtime stream emits that part.
          const part = rawPart as typeof rawPart | {
            type: "tool-result";
            result: unknown;
            toolName: string;
            toolCallId: string;
          };
          if (part.type === "error") throw part.error;
          if (part.type === "text-delta") {
            emittedProviderOutput = true;
            accumulated += part.textDelta;
            safeEnqueue({
              type: "text_delta",
              turnId: params.body.idempotencyKey,
              delta: part.textDelta,
            });
          } else if (part.type === "tool-call") {
            toolActivity = true;
            toolCalls += 1;
            if (toolCalls > MAX_TOOL_CALLS) throw new Error("Maximum tool-call limit exceeded.");
            await persistMessageEvent({
              supabase: params.supabase,
              event: null,
              eventType: "tool_call",
              messageId: params.assistantMessageId,
              conversationId: params.conversationId,
              workspaceId: params.ctx.workspaceId,
              userId: params.ctx.userId,
              toolName: part.toolName,
              payload: { tool_call_id: part.toolCallId },
            });
          } else if (part.type === "tool-result") {
            toolActivity = true;
            const resultValue = part.result as Record<string, unknown> | null;
            const isApproval =
              resultValue &&
              resultValue.status === "pending_approval" &&
              typeof resultValue.approvalId === "string";
            if (isApproval) {
              const event: ChatStreamEvent = {
                type: "approval",
                turnId: params.body.idempotencyKey,
                approvalId: String(resultValue.approvalId),
                toolName: part.toolName,
                summary:
                  typeof resultValue.summary === "string"
                    ? resultValue.summary
                    : `Approve ${part.toolName}`,
              };
              uiEvents.push(event);
              safeEnqueue(event);
              await persistMessageEvent({
                supabase: params.supabase,
                event,
                messageId: params.assistantMessageId,
                conversationId: params.conversationId,
                workspaceId: params.ctx.workspaceId,
                userId: params.ctx.userId,
                toolName: part.toolName,
                approvalId: event.approvalId,
              });
            } else {
              await persistMessageEvent({
                supabase: params.supabase,
                event: null,
                eventType: "tool_result",
                messageId: params.assistantMessageId,
                conversationId: params.conversationId,
                workspaceId: params.ctx.workspaceId,
                userId: params.ctx.userId,
                toolName: part.toolName,
                payload: { tool_call_id: part.toolCallId, returned: true },
              });
            }
          }
        }

        if (!accumulated.trim() && uiEvents.some((event) => event.type === "approval")) {
          accumulated = "I prepared the connected-app action for your approval. Nothing has been sent or changed yet.";
          safeEnqueue({
            type: "text_delta",
            turnId: params.body.idempotencyKey,
            delta: accumulated,
          });
        }
        if (!accumulated.trim()) throw new Error("The model returned an empty response.");

        const usage = await result.usage;
        logGeneration({
          name: "chat",
          model: candidate,
          latencyMs: Date.now() - params.started,
          workspaceId: params.ctx.workspaceId,
          metadata: {
            mode: params.body.mode,
            intent: params.intent,
            tools: params.chatTools?.toolNames.join(",") ?? null,
            tool_calls: toolCalls,
          },
          usage,
        });

        if (
          intentNeedsMemorySuggest(
            params.intent,
            params.body.message,
            Boolean(params.body.attachments?.length),
          )
        ) {
          const suggestions = await suggestMemoriesFromTurn({
            supabase: params.supabase,
            workspaceId: params.ctx.workspaceId,
            userId: params.ctx.userId,
            projectId: params.body.projectId ?? null,
            userMessage: params.body.message,
            assistantMessage: accumulated,
            sourceMessageId: params.userMessageId,
          });
          for (const suggestion of suggestions.suggestions) {
            const event: ChatStreamEvent =
              suggestion.approvalStatus === "approved"
                ? {
                    type: "memory_saved",
                    turnId: params.body.idempotencyKey,
                    memoryId: suggestion.id,
                    content: suggestion.content,
                  }
                : {
                    type: "memory_suggestion",
                    turnId: params.body.idempotencyKey,
                    memoryId: suggestion.id,
                    content: suggestion.content,
                    memoryType: suggestion.type,
                  };
            uiEvents.push(event);
            safeEnqueue(event);
            await persistMessageEvent({
              supabase: params.supabase,
              event,
              messageId: params.assistantMessageId,
              conversationId: params.conversationId,
              workspaceId: params.ctx.workspaceId,
              userId: params.ctx.userId,
            });
          }
        }

        await completeAssistantMessage({
          supabase: params.supabase,
          assistantMessageId: params.assistantMessageId,
          content: accumulated,
          events: uiEvents,
          citations: params.citations,
        });
        await params.supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", params.conversationId)
          .eq("workspace_id", params.ctx.workspaceId);

        if (env.llmTrainingLogsEnabled) {
          await params.supabase.from("llm_training_logs").insert({
            workspace_id: params.ctx.workspaceId,
            user_id: params.ctx.userId,
            project_id: params.body.projectId ?? null,
            model_id: candidate,
            system_prompt: params.system,
            messages_json: params.modelMessages,
            response_text: accumulated,
          });
        }

        safeEnqueue({
          type: "done",
          turnId: params.body.idempotencyKey,
          status: "completed",
          messageId: params.assistantMessageId,
          model: candidate,
        });
        controller.close();
        return;
      } catch (error) {
        lastError = error;
        await logError({
          area: "chat",
          error,
          workspaceId: params.ctx.workspaceId,
          userId: params.ctx.userId,
          provider: candidate.split(":")[0],
        });
        if (emittedProviderOutput || toolActivity || timeout.signal.aborted) break;
      }
    }

    const terminal = classifyTerminalError(lastError, params.req.signal.aborted, {
      requiresTools: Boolean(params.chatTools && Object.keys(params.chatTools.tools).length),
    });
    const traceId = await logError({
      area: "chat",
      error: lastError,
      workspaceId: params.ctx.workspaceId,
      userId: params.ctx.userId,
      provider: selectedModel.split(":")[0],
      latencyMs: Date.now() - params.started,
    });
    const content = accumulated.trim()
      ? `${accumulated}\n\n${terminal.userMessage}`
      : terminal.userMessage;
    await params.supabase
      .from("messages")
      .update({
        status: terminal.status,
        content,
        error_code: terminal.code,
        error_message: terminal.userMessage,
        trace_id: traceId,
        completed_at: new Date().toISOString(),
        cancelled_at: terminal.status === "cancelled" ? new Date().toISOString() : null,
        metadata: { stream_version: 1, events: uiEvents },
      })
      .eq("id", params.assistantMessageId)
      .eq("workspace_id", params.ctx.workspaceId)
      .in("status", ["pending", "streaming"]);
    const errorEvent: ChatStreamEvent = {
      type: "error",
      turnId: params.body.idempotencyKey,
      code: terminal.code,
      message: terminal.userMessage,
      traceId,
      status: terminal.status,
    };
    safeEnqueue(errorEvent);
    await persistMessageEvent({
      supabase: params.supabase,
      event: errorEvent,
      messageId: params.assistantMessageId,
      conversationId: params.conversationId,
      workspaceId: params.ctx.workspaceId,
      userId: params.ctx.userId,
    });
    safeEnqueue({
      type: "done",
      turnId: params.body.idempotencyKey,
      status: terminal.status,
      messageId: params.assistantMessageId,
      model: selectedModel,
    });
    controller.close();
  } finally {
    clearTimeout(timer);
    params.req.signal.removeEventListener("abort", abortFromRequest);
  }
}

async function completeAssistantMessage(params: {
  supabase: SupabaseClient;
  assistantMessageId: string;
  content: string;
  events: ChatStreamEvent[];
  citations: Citation[];
}) {
  const { error } = await params.supabase
    .from("messages")
    .update({
      status: "completed",
      content: params.content,
      citations: params.citations,
      error_code: null,
      error_message: null,
      trace_id: null,
      completed_at: new Date().toISOString(),
      metadata: { stream_version: 1, events: params.events },
    })
    .eq("id", params.assistantMessageId)
    .in("status", ["pending", "streaming"]);
  if (error) {
    throw new AppError({
      area: "chat",
      category: "internal",
      userMessage: "The response completed but could not be saved.",
      internal: error,
    });
  }
}

async function persistMessageEvent(params: {
  supabase: SupabaseClient;
  event: ChatStreamEvent | null;
  eventType?: string;
  messageId: string;
  conversationId: string;
  workspaceId: string;
  userId: string;
  toolName?: string;
  approvalId?: string;
  payload?: Record<string, unknown>;
}) {
  const eventType =
    params.eventType ??
    (params.event?.type === "approval"
      ? "approval"
      : params.event?.type === "memory_saved"
        ? "memory_saved"
        : params.event?.type === "memory_suggestion"
          ? "memory_suggestion"
          : params.event?.type === "error"
            ? "error"
            : null);
  if (!eventType) return;
  const { error } = await params.supabase.from("message_events").insert({
    message_id: params.messageId,
    conversation_id: params.conversationId,
    workspace_id: params.workspaceId,
    user_id: params.userId,
    event_type: eventType,
    status: params.event?.type === "error" ? params.event.status : "completed",
    tool_name: params.toolName ?? (params.event?.type === "approval" ? params.event.toolName : null),
    approval_id: params.approvalId ?? (params.event?.type === "approval" ? params.event.approvalId : null),
    payload: params.payload ?? params.event ?? {},
  });
  if (error) {
    await logError({ area: "chat", error, workspaceId: params.workspaceId, userId: params.userId });
  }
}

function responseHeaders(conversationId: string, messageId: string, citations: Citation[] = []) {
  const headers = new Headers({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
    "x-aria-conversation-id": conversationId,
    "x-aria-message-id": messageId,
  });
  if (citations.length) {
    headers.set(
      "x-aria-citations",
      Buffer.from(JSON.stringify(citations), "utf8").toString("base64"),
    );
  }
  return headers;
}

function eventListResponse(params: {
  conversationId: string;
  messageId: string;
  turnId: string;
  text: string;
  events: ChatStreamEvent[];
}) {
  const events: ChatStreamEvent[] = [
    {
      type: "turn_started",
      turnId: params.turnId,
      conversationId: params.conversationId,
      messageId: params.messageId,
    },
    { type: "text_delta", turnId: params.turnId, delta: params.text },
    ...params.events,
    {
      type: "done",
      turnId: params.turnId,
      status: "completed",
      messageId: params.messageId,
    },
  ];
  return new Response(Buffer.concat(events.map((event) => Buffer.from(encodeChatStreamEvent(event)))), {
    status: 200,
    headers: responseHeaders(params.conversationId, params.messageId),
  });
}

function completedReplayResponse(
  conversationId: string,
  messageId: string,
  turnId: string,
  content: string,
) {
  return eventListResponse({ conversationId, messageId, turnId, text: content, events: [] });
}
