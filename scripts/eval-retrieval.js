/**
 * Retrieval quality eval — runs hybrid retrieval against a LIVE Supabase
 * project with real ingested documents and reports precision/recall metrics.
 *
 * Usage:  npm run eval:retrieval
 *
 * Required env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENAI_API_KEY
 *   EVAL_USER_EMAIL, EVAL_USER_PASSWORD   (a real login — RLS applies)
 *   EVAL_WORKSPACE_ID                      (the workspace holding the corpus)
 *
 * Fixtures: tests/fixtures/retrieval/fixtures.json
 *   [{ "query": "...", "expect_phrases": ["...", "..."] }]
 * A query PASSES when at least one expected phrase appears (case-insensitive)
 * in the top-5 retrieved chunks. Reported: pass rate (recall@5 proxy) and
 * mean matched-phrase coverage (precision proxy).
 *
 * Exits 0 with a SKIP notice when env is missing, so CI stays green until the
 * live project is wired. Release bar (blueprint Part 16): pass rate >= 0.8.
 */
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "OPENAI_API_KEY",
  "EVAL_USER_EMAIL",
  "EVAL_USER_PASSWORD",
  "EVAL_WORKSPACE_ID",
];

async function main() {
  const missing = REQUIRED.filter((k) => !(process.env[k] || "").trim());
  if (missing.length) {
    console.log(`SKIP retrieval eval — missing env: ${missing.join(", ")}`);
    console.log("Add EVAL_USER_EMAIL / EVAL_USER_PASSWORD / EVAL_WORKSPACE_ID to run it live.");
    process.exit(0);
  }

  const fixturesPath = path.join(__dirname, "..", "tests", "fixtures", "retrieval", "fixtures.json");
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    console.error("No fixtures found — add real queries for YOUR corpus to fixtures.json.");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.EVAL_USER_EMAIL,
    password: process.env.EVAL_USER_PASSWORD,
  });
  if (authErr) {
    console.error(`Auth failed: ${authErr.message}`);
    process.exit(1);
  }

  let passed = 0;
  let coverageSum = 0;
  const failures = [];

  for (const f of fixtures) {
    const embedding = await embed(f.query);
    const { data: rows, error } = await supabase.rpc("hybrid_match_document_chunks", {
      query_embedding: JSON.stringify(embedding),
      query_text: f.query,
      match_workspace_id: process.env.EVAL_WORKSPACE_ID,
      match_project_id: null,
      match_count: 5,
    });
    if (error) {
      failures.push({ query: f.query, reason: `RPC error: ${error.message}` });
      continue;
    }
    const corpus = (rows ?? []).map((r) => String(r.content ?? "")).join("\n").toLowerCase();
    const hits = (f.expect_phrases ?? []).filter((p) => corpus.includes(String(p).toLowerCase()));
    const covered = hits.length / Math.max(1, (f.expect_phrases ?? []).length);
    coverageSum += covered;
    if (hits.length > 0) passed += 1;
    else failures.push({ query: f.query, reason: "no expected phrase in top-5 chunks" });
  }

  const passRate = passed / fixtures.length;
  const meanCoverage = coverageSum / fixtures.length;
  console.log(`\nRetrieval eval — ${fixtures.length} queries`);
  console.log(`  recall@5 (>=1 phrase found): ${(passRate * 100).toFixed(1)}%`);
  console.log(`  mean phrase coverage:        ${(meanCoverage * 100).toFixed(1)}%`);
  for (const f of failures) console.log(`  FAIL: "${f.query}" — ${f.reason}`);
  console.log(passRate >= 0.8 ? "\nRESULT: PASS (>= 0.8 bar)" : "\nRESULT: BELOW BAR (< 0.8) — inspect chunking/hybrid weights");
  process.exit(passRate >= 0.8 ? 0 : 2);
}

async function embed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.data[0].embedding;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
