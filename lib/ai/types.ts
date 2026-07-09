export interface Citation {
  index: number;
  title: string;
  page?: number | null;
  section?: string | null;
  url?: string | null;
  snippet?: string | null;
  kind: "file" | "web";
}

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  section_title: string | null;
  chunk_index: number;
  similarity: number;
  filename: string;
  source_url: string | null;
}

export interface ChatRequestMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
