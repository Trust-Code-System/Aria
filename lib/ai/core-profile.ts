import type { SupabaseClient } from "@supabase/supabase-js";

export interface CoreProfile {
  displayName: string | null;
  preferredName: string | null;
  primaryEmail: string | null;
  company: string | null;
  role: string | null;
  signature: string | null;
  timezone: string | null;
  language: string | null;
  communicationPreferences: Record<string, unknown>;
  historyRetrievalEnabled: boolean;
}
export async function getCoreProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<CoreProfile> {
  let result = await supabase
    .from("profiles")
    .select(
      "display_name, preferred_name, email, company, role_title, signature, timezone, language, communication_preferences, history_retrieval_enabled",
    )
    .eq("id", userId)
    .maybeSingle();

  if (result.error) {
    result = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle();
  }
  const row = (result.data ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof row[key] === "string" && row[key] ? String(row[key]) : null);
  return {
    displayName: text("display_name"),
    preferredName: text("preferred_name"),
    primaryEmail: text("email"),
    company: text("company"),
    role: text("role_title"),
    signature: text("signature"),
    timezone: text("timezone"),
    language: text("language"),
    communicationPreferences:
      row.communication_preferences && typeof row.communication_preferences === "object"
        ? (row.communication_preferences as Record<string, unknown>)
        : {},
    historyRetrievalEnabled: row.history_retrieval_enabled !== false,
  };
}

export function renderCoreProfile(profile: CoreProfile): string | null {
  const entries = [
    ["Display name", profile.displayName],
    ["Preferred name", profile.preferredName],
    ["Primary email", profile.primaryEmail],
    ["Company", profile.company],
    ["Role", profile.role],
    ["Signature", profile.signature],
    ["Timezone", profile.timezone],
    ["Language", profile.language],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const prefs = Object.entries(profile.communicationPreferences)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 8)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`);
  if (!entries.length && !prefs.length) return null;
  return [
    ...entries.map(([label, value]) => `- ${label}: ${value}`),
    ...prefs.map((value) => `- Communication preference: ${value}`),
  ].join("\n");
}
