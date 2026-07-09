import { requireSession } from "@/lib/auth/guards";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageShell } from "@/components/page-shell";
import { ContactsClient, type ContactRow } from "@/components/contacts/contacts-client";

export const metadata = { title: "Contacts · Aria" };

export default async function ContactsPage() {
  const ctx = await requireSession();
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("workspace_id", ctx.workspaceId)
    .order("full_name", { ascending: true })
    .limit(500);

  return (
    <PageShell
      title="Contacts"
      description="The people you work with — relationship notes, last contact, and follow-up nudges. Drafting or sending messages always goes through approval."
    >
      <ContactsClient initial={(data ?? []) as ContactRow[]} />
    </PageShell>
  );
}
