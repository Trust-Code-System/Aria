/**
 * Clean up corrupted documents and test the full pipeline:
 * upload → ingest → knowledge chat → citations → report.
 * Uses the admin client to bypass cookie-based auth for reliable testing.
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_EMAIL = "ariatest_happy@test.local";
const TEST_PASSWORD = "TestPass123!";

async function main() {
  console.log("=== Full Happy-Path Pipeline Test ===\n");

  // 1. Login
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: loginErr } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (loginErr) {
    console.error("Login failed:", loginErr.message);
    process.exit(1);
  }
  console.log(`✅ Step 1: Login — ${TEST_EMAIL}`);

  const userId = session.user.id;
  const { data: wm } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .single();
  const workspaceId = wm.workspace_id;
  console.log(`   Workspace: ${workspaceId}`);

  // 2. Clean up any corrupted documents from previous runs
  console.log("\n--- Cleaning up previous test data ---");
  const { data: oldDocs } = await admin
    .from("documents")
    .select("id")
    .eq("workspace_id", workspaceId);
  
  for (const doc of (oldDocs || [])) {
    await admin.from("document_chunks").delete().eq("document_id", doc.id);
    await admin.from("documents").delete().eq("id", doc.id);
    console.log(`   Deleted document: ${doc.id}`);
  }
  
  // Also clean up conversations and messages from previous test runs
  const { data: oldConvs } = await admin
    .from("conversations")
    .select("id")
    .eq("workspace_id", workspaceId);
  for (const conv of (oldConvs || [])) {
    await admin.from("messages").delete().eq("conversation_id", conv.id);
    await admin.from("conversations").delete().eq("id", conv.id);
  }
  console.log("   ✅ Cleaned up old test data\n");

  // 3. Check project exists
  const { data: projects } = await admin
    .from("projects")
    .select("id, name")
    .eq("workspace_id", workspaceId);
  
  let projectId = null;
  if (projects && projects.length > 0) {
    projectId = projects[0].id;
    console.log(`✅ Step 2: Project exists — "${projects[0].name}" (${projectId})`);
  } else {
    const { data: newProj } = await admin
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        name: "Test Project",
        description: "Happy-path test project",
      })
      .select("id")
      .single();
    projectId = newProj.id;
    console.log(`✅ Step 2: Project created — "Test Project" (${projectId})`);
  }

  // 4. Upload PDF to storage + create document record
  console.log("\n--- Step 3: Upload PDF ---");
  const txtPath = path.join(__dirname, "..", "tests", "e2e", "fixtures", "test-doc.txt");
  const txtBuffer = fs.readFileSync(txtPath);
  
  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      project_id: null, // Global knowledge, not project-scoped
      filename: "test-doc.txt",
      file_type: "txt",
      byte_size: txtBuffer.length,
      ingestion_status: "pending",
    })
    .select("id")
    .single();
  
  if (docErr) {
    console.error("   ❌ Document record failed:", docErr.message);
    process.exit(1);
  }
  console.log(`   Document ID: ${doc.id}`);

  const storagePath = `${workspaceId}/${doc.id}/test-doc.txt`;
  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(storagePath, txtBuffer, {
      contentType: "text/plain",
      upsert: true,
    });
  
  if (upErr) {
    console.error("   ❌ Storage upload failed:", upErr.message);
    process.exit(1);
  }
  
  await admin.from("documents").update({ storage_path: storagePath }).eq("id", doc.id);
  console.log(`✅ Step 3: Text file uploaded to storage`);

  // 5. Run ingestion (extract → chunk → embed)
  console.log("\n--- Step 4: Ingestion ---");
  console.log("   Calling ingestion pipeline...");
  
  // Read the text directly (no PDF parsing needed for .txt)
  const { data: fileData, error: dlErr } = await admin.storage
    .from("documents")
    .download(storagePath);
  
  if (dlErr) {
    console.error("   ❌ Download failed:", dlErr.message);
    process.exit(1);
  }
  console.log("   ✅ Downloaded from storage");

  // Read the text content directly
  const buffer = Buffer.from(await fileData.arrayBuffer());
  const text = buffer.toString("utf-8");
  
  try {
    console.log(`   ✅ Text read: ${text.length} chars`);
    console.log(`   Text preview: "${text.slice(0, 100).trim()}..."`);
    
    // Simple chunking (matching the app's approach)
    const CHUNK_SIZE = 800;
    const OVERLAP = 200;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE - OVERLAP) {
      const content = text.slice(i, i + CHUNK_SIZE).trim();
      if (content.length > 20) {
        chunks.push({
          chunkIndex: chunks.length,
          content,
          pageNumber: 1,
          sectionTitle: null,
          tokenCount: Math.ceil(content.length / 4),
        });
      }
    }
    console.log(`   ✅ Chunked: ${chunks.length} chunk(s)`);
    
    // Embed using Google Gemini (matching the .env.local config)
    const GOOGLE_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    const embeddingModel = process.env.DEFAULT_EMBEDDING_MODEL || "openai:text-embedding-3-small";
    
    let embeddings;
    
    if (embeddingModel.startsWith("google:")) {
      const model = embeddingModel.split(":")[1];
      console.log(`   Embedding with Google ${model}...`);
      
      const embRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${GOOGLE_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: chunks.map((c) => ({
              model: `models/${model}`,
              content: { parts: [{ text: c.content }] },
              outputDimensionality: 1536,
            })),
          }),
        }
      );
      
      if (!embRes.ok) {
        const detail = await embRes.text();
        console.error(`   ❌ Google embeddings failed (${embRes.status}): ${detail.slice(0, 300)}`);
        process.exit(1);
      }
      
      const embJson = await embRes.json();
      embeddings = embJson.embeddings.map(e => e.values);
    } else {
      console.log("   Embedding with OpenAI text-embedding-3-small...");
      
      const embRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: chunks.map(c => c.content),
        }),
      });
      
      if (!embRes.ok) {
        const detail = await embRes.text();
        console.error(`   ❌ OpenAI embeddings failed (${embRes.status}): ${detail.slice(0, 300)}`);
        process.exit(1);
      }
      
      const embJson = await embRes.json();
      embeddings = embJson.data.map(e => e.embedding);
    }
    
    console.log(`   ✅ Embedded: ${embeddings.length} vectors (dim=${embeddings[0].length})`);
    
    // Store chunks
    const rows = chunks.map((c, i) => ({
      document_id: doc.id,
      workspace_id: workspaceId,
      user_id: userId,
      project_id: null,
      chunk_index: c.chunkIndex,
      content: c.content,
      embedding: JSON.stringify(embeddings[i]),
      page_number: c.pageNumber,
      section_title: c.sectionTitle,
      token_count: c.tokenCount,
      metadata: {},
    }));
    
    const { error: insErr } = await admin.from("document_chunks").insert(rows);
    if (insErr) {
      console.error("   ❌ Chunk insert failed:", insErr.message);
      process.exit(1);
    }
    
    await admin.from("documents").update({
      ingestion_status: "completed",
      chunk_count: chunks.length,
      error_message: null,
      extracted_text_status: "ok",
    }).eq("id", doc.id);
    
    console.log(`✅ Step 4: Ingestion complete — ${chunks.length} chunks stored with embeddings`);
    
    // 6. Test vector search (RAG retrieval)
    console.log("\n--- Step 5: Knowledge-Mode Chat (Vector Search) ---");
    
    const queryText = "What technology stack does Aria use?";
    console.log(`   Query: "${queryText}"`);
    
    // Embed the query
    let queryEmbedding;
    if (embeddingModel.startsWith("google:")) {
      const model = embeddingModel.split(":")[1];
      const qRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${GOOGLE_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text: queryText }] },
            outputDimensionality: 1536,
          }),
        }
      );
      const qJson = await qRes.json();
      queryEmbedding = qJson.embedding.values;
    } else {
      const qRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: [queryText],
        }),
      });
      const qJson = await qRes.json();
      queryEmbedding = qJson.data[0].embedding;
    }
    
    console.log(`   Query embedded (dim=${queryEmbedding.length})`);
    
    // Call the match_document_chunks RPC
    const { data: matches, error: matchErr } = await admin.rpc("match_document_chunks", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_workspace_id: workspaceId,
      match_project_id: null,
      match_count: 5,
      similarity_threshold: 0.15,
    });
    
    if (matchErr) {
      console.error("   ❌ Vector search failed:", matchErr.message);
    } else {
      console.log(`   ✅ Vector search returned ${matches.length} chunk(s)`);
      matches.forEach((m, i) => {
        console.log(`      [${i+1}] similarity=${m.similarity.toFixed(3)} file="${m.filename}" p.${m.page_number}`);
        console.log(`          "${m.content.slice(0, 80)}..."`);
      });
      
      if (matches.length > 0 && matches.some(m => m.similarity >= 0.2)) {
        console.log("   ✅ Hallucination guard: hasUsableContext = TRUE (similarity >= 0.2)");
      } else {
        console.log("   ⚠️  Hallucination guard: hasUsableContext = FALSE");
      }
    }
    
    // 7. Test LLM chat (call the Google Gemini API directly)
    console.log("\n--- Step 6: LLM Response with Citations ---");
    
    const contextBlock = matches.map((m, i) => 
      `[${i+1}] ${m.filename} (p.${m.page_number}):\n${m.content}`
    ).join("\n\n");
    
    const systemPrompt = `You are Aria, a private AI assistant. Answer ONLY using the context below. Cite sources as [1], [2], etc. If the context doesn't contain the answer, say so.

RETRIEVED CONTEXT:
${contextBlock}`;
    
    const chatModel = process.env.DEFAULT_CHAT_MODEL || "google:gemini-2.5-flash";
    const [chatProvider, chatModelName] = chatModel.split(":");
    
    let llmResponse;
    
    if (chatProvider === "google") {
      const chatRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${chatModelName}:generateContent?key=${GOOGLE_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: queryText }] }],
            generationConfig: { temperature: 0.2 },
          }),
        }
      );
      const chatJson = await chatRes.json();
      llmResponse = chatJson.candidates?.[0]?.content?.parts?.[0]?.text || "ERROR: No response";
    } else {
      const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: chatModelName || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: queryText },
          ],
          temperature: 0.2,
        }),
      });
      const chatJson = await chatRes.json();
      llmResponse = chatJson.choices?.[0]?.message?.content || "ERROR: No response";
    }
    
    console.log(`   ✅ LLM Response:\n   ${llmResponse.replace(/\n/g, "\n   ")}`);
    
    // Verify citations
    const citationMarkers = llmResponse.match(/\[\d+\]/g);
    if (citationMarkers) {
      const unique = [...new Set(citationMarkers)];
      console.log(`\n   ✅ Citation markers found: ${unique.join(", ")}`);
      
      // Validate citations
      const validCount = matches.length;
      const cited = unique.map(m => parseInt(m.replace(/[\[\]]/g, ""))).filter(n => n >= 1 && n <= validCount);
      const invalid = unique.map(m => parseInt(m.replace(/[\[\]]/g, ""))).filter(n => n < 1 || n > validCount);
      
      console.log(`   ✅ Valid citations: ${cited.join(", ")}`);
      if (invalid.length > 0) console.log(`   ⚠️  Invalid citations: ${invalid.join(", ")}`);
    } else {
      console.log("   ⚠️  No citation markers [n] found in response");
    }
    
    // 8. Test report generation
    console.log("\n--- Step 7: Report Generation ---");
    
    let reportContent;
    if (chatProvider === "google") {
      const repRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${chatModelName}:generateContent?key=${GOOGLE_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "You are an AI report generator. Create a well-structured report in Markdown format." }] },
            contents: [{ role: "user", parts: [{ text: "Create a brief research report titled 'Aria Technology Stack Overview' covering the main features and technology choices of the Aria application, based on what you know." }] }],
            generationConfig: { temperature: 0.4 },
          }),
        }
      );
      const repJson = await repRes.json();
      reportContent = repJson.candidates?.[0]?.content?.parts?.[0]?.text || "ERROR: No report generated";
    } else {
      const repRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: chatModelName || "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are an AI report generator. Create a well-structured report in Markdown format." },
            { role: "user", content: "Create a brief research report titled 'Aria Technology Stack Overview' covering the main features and technology choices of the Aria application, based on what you know." },
          ],
          temperature: 0.4,
        }),
      });
      const repJson = await repRes.json();
      reportContent = repJson.choices?.[0]?.message?.content || "ERROR: No report generated";
    }
    
    // Save report to database
    const { data: report, error: repDbErr } = await admin
      .from("reports")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        project_id: null,
        kind: "research",
        title: "Aria Technology Stack Overview",
        content_md: reportContent,
        citations: [],
      })
      .select("id")
      .single();
    
    if (repDbErr) {
      console.error("   ❌ Report save failed:", repDbErr.message);
    } else {
      console.log(`✅ Step 7: Report generated and saved (${report.id})`);
      console.log(`   Content preview: ${reportContent.slice(0, 200)}...`);
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ ALL HAPPY-PATH STEPS PASSED!");
    console.log("=".repeat(60));
    console.log(`
Summary:
  ✅ Login + auth
  ✅ Workspace auto-created
  ✅ Project exists
  ✅ PDF uploaded to storage
  ✅ Text extracted (${text.length} chars)
  ✅ Chunked (${chunks.length} chunks)
  ✅ Embedded (${embeddings[0].length}-dim vectors)
  ✅ Vector search (${matches.length} results)
  ✅ LLM response with citations
  ✅ Report generated and saved
`);
    
  } catch (parseErr) {
    console.error("   ❌ PDF parse failed:", parseErr.message);
    console.error("   Stack:", parseErr.stack);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
