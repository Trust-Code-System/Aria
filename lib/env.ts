/**
 * Centralized, typed access to environment configuration.
 * Nothing here throws on import — missing keys are reported via the `configured`
 * flags so features can degrade gracefully and the app never crashes at boot.
 */

function str(v: string | undefined): string {
  return (v ?? "").trim();
}

export const env = {
  appUrl: str(process.env.NEXT_PUBLIC_APP_URL) || "http://localhost:3000",
  appEnv: str(process.env.APP_ENV) || "development",

  supabaseUrl: str(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: str(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseServiceKey: str(process.env.SUPABASE_SERVICE_ROLE_KEY),

  openaiKey: str(process.env.OPENAI_API_KEY),
  anthropicKey: str(process.env.ANTHROPIC_API_KEY),
  googleKey: str(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
  
  // Custom Personal API
  customApiUrl: str(process.env.CUSTOM_API_URL) || "http://localhost:11434/v1", // Ollama default

  perplexityKey: str(process.env.PERPLEXITY_API_KEY),
  tavilyKey: str(process.env.TAVILY_API_KEY),

  // Connectors (Composio) — one integration unlocks 500+ apps.
  composioKey: str(process.env.COMPOSIO_API_KEY),
  composioBaseUrl: str(process.env.COMPOSIO_BASE_URL) || "https://backend.composio.dev",
  // Per-app auth config ids created in the Composio dashboard.
  composioGmailAuthConfigId: str(process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID),
  composioGoogleCalendarAuthConfigId: str(process.env.COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID),
  composioGoogleDriveAuthConfigId: str(process.env.COMPOSIO_GOOGLE_DRIVE_AUTH_CONFIG_ID),
  composioSlackAuthConfigId: str(process.env.COMPOSIO_SLACK_AUTH_CONFIG_ID),
  composioNotionAuthConfigId: str(process.env.COMPOSIO_NOTION_AUTH_CONFIG_ID),
  composioGithubAuthConfigId: str(process.env.COMPOSIO_GITHUB_AUTH_CONFIG_ID),
  composioLinearAuthConfigId: str(process.env.COMPOSIO_LINEAR_AUTH_CONFIG_ID),
  composioJiraAuthConfigId: str(process.env.COMPOSIO_JIRA_AUTH_CONFIG_ID),
  composioTrelloAuthConfigId: str(process.env.COMPOSIO_TRELLO_AUTH_CONFIG_ID),
  composioAsanaAuthConfigId: str(process.env.COMPOSIO_ASANA_AUTH_CONFIG_ID),
  composioHubspotAuthConfigId: str(process.env.COMPOSIO_HUBSPOT_AUTH_CONFIG_ID),
  composioSalesforceAuthConfigId: str(process.env.COMPOSIO_SALESFORCE_AUTH_CONFIG_ID),
  composioOutlookAuthConfigId: str(process.env.COMPOSIO_OUTLOOK_AUTH_CONFIG_ID),

  defaultChatModel: str(process.env.DEFAULT_CHAT_MODEL) || "openai:gpt-5.6",
  defaultEmbeddingModel:
    str(process.env.DEFAULT_EMBEDDING_MODEL) || "openai:text-embedding-3-small",
  defaultResearchModel: str(process.env.DEFAULT_RESEARCH_MODEL) || "perplexity:sonar",

  adminEmails: str(process.env.ADMIN_EMAIL)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  maxUploadMb: Number(str(process.env.MAX_UPLOAD_MB) || "25"),

  /**
   * Opt-in continuous distillation. Off by default — full prompts are sensitive.
   * Set LLM_TRAINING_LOGS_ENABLED=true to write llm_training_logs rows.
   */
  llmTrainingLogsEnabled: ["1", "true", "yes"].includes(
    str(process.env.LLM_TRAINING_LOGS_ENABLED).toLowerCase(),
  ),
  /** Days to retain training logs when enabled. 0 = keep forever (not recommended). */
  llmTrainingLogsTtlDays: Math.max(0, Number(str(process.env.LLM_TRAINING_LOGS_TTL_DAYS) || "30")),

  /**
   * When true (default), enqueued jobs are also kicked inline after insert so
   * local/dev stays snappy. Set JOBS_INLINE=false when a real worker/cron drains
   * /api/jobs/drain instead (serverless-safe path).
   */
  jobsInline: !["0", "false", "no"].includes(str(process.env.JOBS_INLINE).toLowerCase()),

  /**
   * TEMPORARY: skip login redirects and act as ADMIN_EMAIL's user.
   * Anyone with the URL gets that account's access — turn off for production.
   * Requires SUPABASE_SERVICE_ROLE_KEY + ADMIN_EMAIL of an existing user.
   */
  authDisabled: ["1", "true", "yes"].includes(str(process.env.AUTH_DISABLED).toLowerCase()),
};

export const configured = {
  get supabase() {
    return Boolean(env.supabaseUrl && env.supabaseAnonKey);
  },
  get supabaseAdmin() {
    return Boolean(env.supabaseUrl && env.supabaseServiceKey);
  },
  get anyLlm() {
    return Boolean(env.openaiKey || env.anthropicKey || env.googleKey);
  },
  get embeddings() {
    // Embeddings work with OpenAI or Google, depending on DEFAULT_EMBEDDING_MODEL.
    const isGoogle = env.defaultEmbeddingModel.startsWith("google:");
    return Boolean(isGoogle ? env.googleKey : env.openaiKey);
  },
  get research() {
    return Boolean(env.perplexityKey || env.tavilyKey);
  },
  get connectors() {
    return Boolean(env.composioKey);
  },
};

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  if (env.adminEmails.length === 0) return false;
  return env.adminEmails.includes(email.toLowerCase());
}
