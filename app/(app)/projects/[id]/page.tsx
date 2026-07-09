import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { ProjectDetail } from "@/components/projects/project-detail";
import type { DocRow } from "@/components/knowledge/document-list";

export const metadata = { title: "Project · Aria" };

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const supabase = createServerSupabase();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!project) notFound();

  const [docsRes, convRes, memRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, filename, file_type, byte_size, ingestion_status, chunk_count, error_message, updated_at")
      .eq("project_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("conversations")
      .select("id, title, mode, updated_at")
      .eq("project_id", params.id)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("memories")
      .select("id, content, type, approval_status")
      .eq("project_id", params.id)
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <ProjectDetail
      project={project}
      documents={(docsRes.data ?? []) as DocRow[]}
      conversations={convRes.data ?? []}
      memories={memRes.data ?? []}
    />
  );
}
