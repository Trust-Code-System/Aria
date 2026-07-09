import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { ProjectsClient } from "@/components/projects/projects-client";

export const metadata = { title: "Projects · Aria" };

export default async function ProjectsPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, description, status, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false });

  return (
    <PageShell
      title="Projects"
      description="Group work into spaces with their own files, chats, and memory."
    >
      <ProjectsClient initial={projects ?? []} />
    </PageShell>
  );
}
