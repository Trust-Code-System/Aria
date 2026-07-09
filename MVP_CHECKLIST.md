# MVP Checklist

Status against the acceptance criteria. Legend: ✅ works · 🟡 partial/needs keys · ⏭️ deferred.

## Acceptance criteria

| # | Criterion | Status | Notes |
| --- | --- | --- | --- |
| 1 | User can sign up / log in | ✅ | Supabase Auth; email+password at `/login` |
| 2 | User can create a project | ✅ | `/projects` create/rename/archive/delete |
| 3 | User can chat with AI | ✅ | Streaming, persisted, per-mode |
| 4 | Upload PDF/TXT/MD | ✅ | Drag-drop; DOCX/CSV/JSON too |
| 5 | File stored, parsed, chunked, embedded, searchable | ✅ 🟡 | Needs `OPENAI_API_KEY` for embeddings |
| 6 | Ask questions about uploaded files | ✅ | Knowledge mode |
| 7 | Answers with real citations from retrieved chunks | ✅ | Inline `[n]` + source cards; validated |
| 8 | Web research with citations | 🟡 | Needs `PERPLEXITY_API_KEY` or `TAVILY_API_KEY` |
| 9 | Add/edit/delete memories | ✅ | `/memory` full CRUD + enable/disable |
| 10 | Approved memories influence chat | ✅ | Injected into system prompt |
| 11 | Generate a report and export/download PDF | ✅ | Generate + print-to-PDF export |
| 12 | Admin portal shows errors/jobs/feedback | ✅ 🟡 | Needs service-role key; errors/feedback/failed-ingest |
| 13 | All major failures create admin logs | ✅ | `apiError` + `logError`, sanitized |
| 14 | User never sees raw stack traces | ✅ | Global + route boundaries, toasts, AppError |
| 15 | Private data scoped by user/workspace | ✅ | RLS on all private tables |
| 16 | `.env.example` and README updated | ✅ | Plus ARCHITECTURE/SECURITY/plan |
| 17 | Clear checklist of done/remaining | ✅ | This file |

## Modules

| Module | Status | Notes |
| --- | --- | --- |
| Authentication | ✅ | Sign up/in/out, protected routes, profile+workspace bootstrap trigger |
| Workspace/user isolation | ✅ | `workspace_id` everywhere + RLS + membership helper |
| Project spaces | ✅ | CRUD, instructions injected, files/chats/memory tabs |
| Chat interface | ✅ | Streaming, markdown, code highlight, copy, modes, history |
| Message storage | ✅ | `messages` table, citations persisted |
| File upload | ✅ | Validation, sanitized filenames, private bucket |
| File parsing | ✅ 🟡 | PDF (pdf-parse), DOCX (mammoth), text/md/csv/json |
| Chunking | ✅ | Overlapping, page-aware, boundary-respecting; unit-tested |
| Embeddings | 🟡 | OpenAI embeddings; needs key. Dimension 1536 |
| Vector retrieval | ✅ | `match_document_chunks` RPC, workspace/project filtered |
| RAG answer generation | ✅ | KB mode, context-only prompt |
| Citation accuracy | ✅ | Only retrieved sources cited; `validateCitations` guard + test |
| Web research + citations | 🟡 | Perplexity/Tavily abstraction; needs a key |
| Memory CRUD | ✅ | Add/edit/disable/delete, filter global/project |
| Memory context injection | ✅ | Approved memories only |
| Report generation | ✅ | LLM-generated or saved from chat |
| PDF export | ✅ | Print-ready HTML → browser save-as-PDF |
| Admin error portal | ✅ 🟡 | Needs service-role key |
| Error logging | ✅ | Sanitized metadata + trace ids |
| Designed error states | ✅ | Empty/error/loading components everywhere |
| Database schema | ✅ | 4 migrations, all required tables |
| RLS/security | ✅ | Enabled + policies; see SECURITY.md |
| Environment variables | ✅ | `.env.example` complete |
| Tests | ✅ 🟡 | Unit tests for core logic; no e2e yet |
| UI/UX polish | ✅ | Premium sidebar, cards, badges, citations, dark mode |
| Mobile responsiveness | ✅ | Sidebar drawer, responsive grids |
| Tool/MCP architecture | ✅ | Typed registry; web search live, rest stubbed |

## Deferred (V2+, by design)

⏭️ X/Twitter · Reddit · Gmail · Google Drive · Calendar write · Slack ingestion · GitHub write ·
browser automation · autonomous multi-agent loops · payments/billing · team SaaS · mobile native ·
always-on recording · fine-tuning · knowledge graph · plugin marketplace.

All represented as **typed, disabled tool stubs** in `lib/ai/tools.ts` so they can be added without
rewriting the app.

## Known gaps / next tasks

1. Rate limiting on chat/upload/research endpoints.
2. Move ingestion to the `jobs` queue + a background worker for large files.
3. Auto-memory *suggestions* flow (schema/UI ready; extraction not wired).
4. E2E tests (Playwright) for the auth→upload→ask→cite happy path.
5. Signed-URL document preview in the knowledge list.
