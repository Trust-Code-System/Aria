/**
 * Create a small test PDF with known content for RAG testing.
 * Uses a minimal hand-crafted PDF structure (no external libs needed).
 */
const fs = require("fs");
const path = require("path");

// The content we want to be searchable/citable:
const CONTENT = `Aria is a private AI workspace and second brain application.
It was created as a Chief of Staff tool for personal productivity.
The main features include project management, knowledge base with RAG,
web research with citations, a memory system, and report generation.
The technology stack uses Next.js 14, Supabase with pgvector,
and supports multiple AI providers including OpenAI, Anthropic, and Google.
The embedding dimension is 1536, matching OpenAI text-embedding-3-small.
Documents are stored in a private Supabase Storage bucket.
Row Level Security ensures each user can only see their own data.
The admin portal shows sanitized error logs and user feedback.`;

// Minimal valid PDF
function buildPDF(text) {
  const lines = text.split("\n").filter(Boolean);
  const textContent = lines.map((line, i) => `BT /F1 12 Tf 50 ${700 - i * 18} Td (${escapePDF(line)}) Tj ET`).join("\n");
  
  const objects = [];
  let n = 0;

  // 1: Catalog
  objects.push({ id: ++n, content: `<< /Type /Catalog /Pages 2 0 R >>` });
  // 2: Pages
  objects.push({ id: ++n, content: `<< /Type /Pages /Kids [3 0 R] /Count 1 >>` });
  // 3: Page
  objects.push({ id: ++n, content: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>` });
  // 4: Content stream
  const stream = textContent;
  objects.push({ id: ++n, content: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream` });
  // 5: Font
  objects.push({ id: ++n, content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>` });

  let body = "%PDF-1.4\n";
  const offsets = [];
  
  for (const obj of objects) {
    offsets.push(body.length);
    body += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
  }

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    body += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return body;
}

function escapePDF(str) {
  return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const pdf = buildPDF(CONTENT);
const outPath = path.join(__dirname, "..", "tests", "e2e", "fixtures", "test.pdf");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, pdf);
console.log(`✅ Created test PDF: ${outPath} (${pdf.length} bytes)`);
console.log(`   Content: ${CONTENT.length} chars of known content for RAG testing`);
