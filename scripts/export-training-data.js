/**
 * Export Aria Training Logs for Personal Model Fine-Tuning.
 * 
 * Extracts data from the `llm_training_logs` table (optionally filtered by
 * positive feedback) and converts it to ShareGPT format suitable for training
 * with Unsloth, Axolotl, or LLaMA-Factory.
 *
 * Usage: node scripts/export-training-data.js --only-good
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const onlyGood = process.argv.includes("--only-good");
  console.log(`=== Exporting Training Data (ShareGPT Format) ===`);
  console.log(`Filtering for only positive ratings: ${onlyGood ? "YES" : "NO"}`);

  // 1. Fetch the logs
  let query = admin.from("llm_training_logs").select("*").order("created_at", { ascending: true });
  if (onlyGood) {
    query = query.eq("quality_rating", "up");
  }

  const { data: logs, error } = await query;
  if (error) {
    console.error("Error fetching logs:", error.message);
    process.exit(1);
  }

  if (!logs || logs.length === 0) {
    console.log("No training logs found. Start chatting in Aria to generate data!");
    process.exit(0);
  }

  // 2. Convert to ShareGPT format
  const dataset = logs.map(log => {
    // ShareGPT format expects a list of conversations under "conversations"
    // with "from": "system" | "human" | "gpt"
    
    const conversations = [];
    
    // Add System Prompt
    conversations.push({
      from: "system",
      value: log.system_prompt
    });

    // Add prior context (user and assistant turns)
    const prior = Array.isArray(log.messages_json) ? log.messages_json : [];
    for (const msg of prior) {
      conversations.push({
        from: msg.role === "assistant" ? "gpt" : "human",
        value: msg.content
      });
    }

    // Add the final response that the model generated
    conversations.push({
      from: "gpt",
      value: log.response_text
    });

    return {
      conversations,
      source_model: log.model_id
    };
  });

  // 3. Save to JSONL file
  const outPath = path.join(__dirname, "..", "training_dataset.jsonl");
  const jsonl = dataset.map(item => JSON.stringify(item)).join("\n");
  fs.writeFileSync(outPath, jsonl);

  console.log(`\n✅ Exported ${dataset.length} interaction(s) to ${outPath}`);
  console.log(`This file is ready to be uploaded to Unsloth, Axolotl, or LLaMA-Factory!`);
}

main().catch(console.error);
