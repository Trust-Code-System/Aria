/**
 * Delete expired llm_training_logs rows per LLM_TRAINING_LOGS_TTL_DAYS.
 *
 * Usage:
 *   node scripts/cleanup-training-logs.js
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL.
 * No-op when TTL is 0 (keep forever) or when the table is empty.
 */
const { createClient } = require("@supabase/supabase-js");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ttlDays = Math.max(0, Number(process.env.LLM_TRAINING_LOGS_TTL_DAYS || "30"));

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (ttlDays === 0) {
    console.log("TTL is 0 — retention disabled; nothing to delete.");
    return;
  }

  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await admin
    .from("llm_training_logs")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("Cleanup failed:", error.message);
    process.exit(1);
  }
  console.log(`Deleted ${data?.length ?? 0} training log row(s) older than ${ttlDays} day(s) (before ${cutoff}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
