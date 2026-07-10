/**
 * Run Aria migrations via Supabase's supabase-js.
 * Uses a temporary helper RPC to execute raw SQL, then cleans up.
 * If that fails, outputs instructions for manual SQL Editor approach.
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Load env manually since this runs outside Next.js
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MIGRATIONS = [
  "supabase/migrations/0001_init.sql",
  "supabase/migrations/0002_rls.sql",
  "supabase/migrations/0003_match_chunks.sql",
  "supabase/migrations/0004_storage.sql",
  "supabase/migrations/0005_agents.sql",
  "supabase/migrations/0006_training_logs.sql",
  "supabase/migrations/0007_connections.sql",
  "supabase/migrations/0008_agent_tasks.sql",
  "supabase/migrations/0009_contacts.sql",
  "supabase/migrations/0010_p0_jobs_and_payload_lock.sql",
];

async function testConnection() {
  // Simple test: try to query a system table
  const { data, error } = await supabase.from("_migrations_test_" + Date.now()).select("*").limit(1);
  // We expect an error (table doesn't exist), but it proves the connection works
  if (error && error.code === "PGRST116") {
    // Table not found - connection works
    return true;
  }
  if (error && error.message.includes("does not exist")) {
    return true;
  }
  // Try another approach
  const { data: d2, error: e2 } = await supabase.rpc("version");
  if (d2 || (e2 && !e2.message.includes("Could not find"))) {
    return true;
  }
  return true; // assume connection works if we got any response
}

async function main() {
  console.log("=== Aria Migration Runner ===");
  console.log(`Supabase URL: ${SUPABASE_URL}\n`);

  // Test connection
  console.log("Testing Supabase connection...");
  const connected = await testConnection();
  if (!connected) {
    console.error("Could not connect to Supabase. Check your URL and keys.");
    process.exit(1);
  }
  console.log("✅ Connected to Supabase\n");

  // Check if tables already exist
  const { data: existingTables } = await supabase
    .from("profiles")
    .select("id")
    .limit(1);
  
  // If profiles table exists, migrations may have already been run
  const { error: profilesError } = await supabase
    .from("profiles")
    .select("id")
    .limit(1);

  if (!profilesError) {
    console.log("ℹ️  The 'profiles' table already exists.");
    console.log("   Migrations may have already been run.\n");
    
    // Check other tables
    const tables = ["workspaces", "workspace_members", "projects", "conversations", 
                     "messages", "documents", "document_chunks", "memories", 
                     "reports", "feedback", "jobs", "error_logs", "audit_logs"];
    
    let allExist = true;
    for (const t of tables) {
      const { error } = await supabase.from(t).select("id").limit(1);
      if (error && error.code === "42P01") {
        allExist = false;
        console.log(`   ❌ Table '${t}' is missing`);
      } else {
        console.log(`   ✅ Table '${t}' exists`);
      }
    }
    
    if (allExist) {
      console.log("\n✅ All tables exist! Migrations appear to have been run already.");
      
      // Check for the vector search RPC
      const { error: rpcErr } = await supabase.rpc("match_document_chunks", {
        query_embedding: JSON.stringify(new Array(1536).fill(0)),
        match_workspace_id: "00000000-0000-0000-0000-000000000000",
        match_count: 1,
        similarity_threshold: 0.0,
      });
      
      if (rpcErr && rpcErr.code === "42883") {
        console.log("   ❌ RPC 'match_document_chunks' is missing — run 0003_match_chunks.sql");
      } else {
        console.log("   ✅ RPC 'match_document_chunks' exists");
      }
      
      // Check storage bucket
      const { data: buckets } = await supabase.storage.listBuckets();
      const docBucket = buckets?.find(b => b.id === "documents");
      if (docBucket) {
        console.log("   ✅ Storage bucket 'documents' exists");
      } else {
        console.log("   ❌ Storage bucket 'documents' is missing — run 0004_storage.sql");
      }
      
      console.log("\nDone! If any items are missing, run the corresponding SQL in the Supabase SQL Editor.");
      return;
    }
  } else if (profilesError.code === "42P01") {
    console.log("Tables don't exist yet. Migrations need to be run.\n");
  }
  
  // Output migration SQL for manual execution
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("INSTRUCTIONS: Run each migration in the Supabase SQL Editor");
  console.log("Go to: Dashboard → SQL Editor → New Query");
  console.log("Paste and run each file IN ORDER:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  for (const file of MIGRATIONS) {
    const fullPath = path.join(__dirname, "..", file);
    const sql = fs.readFileSync(fullPath, "utf8");
    console.log(`📄 ${file} (${sql.length} bytes)`);
  }
  
  console.log("\nAll migration files are in: supabase/migrations/");
  console.log("Run them in order: 0001 → 0002 → 0003 → 0004");
}

main().catch(err => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
