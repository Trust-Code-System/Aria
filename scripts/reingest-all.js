/**
 * Re-ingest all documents using the currently configured embedding model.
 * Run after switching DEFAULT_EMBEDDING_MODEL (e.g. OpenAI quota → Google).
 *
 *   node scripts/reingest-all.js
 */
require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const EMBEDDING_DIM = 1536;

async function embedGoogle(texts, apiKey, model = "gemini-embedding-001") {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const slice = texts.slice(i, i + 100);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: slice.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIM,
        })),
      }),
    });
    if (!res.ok) {
      throw new Error(`Google embed failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = await res.json();
    for (const e of json.embeddings ?? []) out.push(e.values);
  }
  return out;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  if (!googleKey) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: docs, error } = await admin
    .from("documents")
    .select("id, workspace_id, user_id, project_id, filename");
  if (error) throw error;

  console.log(`Re-embedding ${docs.length} document(s) with Google…`);

  for (const doc of docs) {
    const { data: chunks, error: cErr } = await admin
      .from("document_chunks")
      .select("id, content")
      .eq("document_id", doc.id)
      .order("chunk_index", { ascending: true });
    if (cErr) throw cErr;
    if (!chunks?.length) {
      console.log(`  skip ${doc.filename}: no chunks`);
      continue;
    }

    console.log(`  ${doc.filename}: ${chunks.length} chunks`);
    const vectors = await embedGoogle(
      chunks.map((c) => c.content),
      googleKey,
    );
    if (vectors.length !== chunks.length) {
      throw new Error(`Embedding count mismatch for ${doc.filename}`);
    }

    for (let i = 0; i < chunks.length; i++) {
      const { error: uErr } = await admin
        .from("document_chunks")
        .update({ embedding: vectors[i] })
        .eq("id", chunks[i].id);
      if (uErr) throw uErr;
    }
    console.log(`  ✓ ${doc.filename}`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
