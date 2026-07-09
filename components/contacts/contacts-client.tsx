"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Trash2, Pencil, BellRing, Mail, Building2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Input, Textarea, Label, Badge, Spinner } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { haptic } from "@/lib/ui/haptics";
import { formatDate } from "@/lib/utils";

export interface ContactRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  tags: string[];
  notes: string | null;
  relationship: string | null;
  last_interaction_at: string | null;
  follow_up_at: string | null;
  updated_at: string;
}

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  tags: string;
  relationship: string;
  notes: string;
  followUpAt: string; // yyyy-mm-dd
}

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  phone: "",
  company: "",
  role: "",
  tags: "",
  relationship: "",
  notes: "",
  followUpAt: "",
};

function toPayload(f: FormState) {
  return {
    fullName: f.fullName.trim(),
    email: f.email.trim() || null,
    phone: f.phone.trim() || null,
    company: f.company.trim() || null,
    role: f.role.trim() || null,
    tags: f.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20),
    relationship: f.relationship.trim() || null,
    notes: f.notes.trim() || null,
    followUpAt: f.followUpAt ? new Date(`${f.followUpAt}T09:00:00`).toISOString() : null,
  };
}

function toForm(c: ContactRow): FormState {
  return {
    fullName: c.full_name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    company: c.company ?? "",
    role: c.role ?? "",
    tags: (c.tags ?? []).join(", "),
    relationship: c.relationship ?? "",
    notes: c.notes ?? "",
    followUpAt: c.follow_up_at ? c.follow_up_at.slice(0, 10) : "",
  };
}

const followUpDue = (c: ContactRow) =>
  c.follow_up_at !== null && new Date(c.follow_up_at).getTime() <= Date.now();

export function ContactsClient({ initial }: { initial: ContactRow[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const q = query.trim().toLowerCase();
  const filtered = q
    ? initial.filter((c) =>
        [c.full_name, c.email, c.company, c.role, (c.tags ?? []).join(" ")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : initial;

  // Follow-ups that are due float to the top.
  const sorted = [...filtered].sort((a, b) => Number(followUpDue(b)) - Number(followUpDue(a)));
  const dueCount = initial.filter(followUpDue).length;

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing("new");
  }
  function openEdit(c: ContactRow) {
    setForm(toForm(c));
    setEditing(c.id);
  }

  async function save() {
    if (!form.fullName.trim()) {
      error("A name is required");
      return;
    }
    setBusy(true);
    haptic("medium");
    try {
      const isNew = editing === "new";
      const res = await fetch("/api/contacts", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? toPayload(form) : { id: editing, ...toPayload(form) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      success(isNew ? "Contact added" : "Contact updated");
      setEditing(null);
      router.refresh();
    } catch (e) {
      error("Could not save contact", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: ContactRow) {
    if (!confirm(`Delete ${c.full_name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts?id=${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      success("Contact deleted");
      router.refresh();
    } catch (e) {
      error("Could not delete contact", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function markTalkedToday(c: ContactRow) {
    setBusy(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, lastInteractionAt: new Date().toISOString(), followUpAt: null }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      success("Marked as contacted today");
      router.refresh();
    } catch (e) {
      error("Could not update contact", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  const editForm = (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{editing === "new" ? "New contact" : "Edit contact"}</h3>
        <button onClick={() => setEditing(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Name *</Label>
          <Input value={form.fullName} onChange={set("fullName")} placeholder="Ada Lovelace" />
        </div>
        <div>
          <Label>Email</Label>
          <Input value={form.email} onChange={set("email")} type="email" placeholder="ada@example.com" />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={form.phone} onChange={set("phone")} placeholder="+1 555 0100" />
        </div>
        <div>
          <Label>Company</Label>
          <Input value={form.company} onChange={set("company")} placeholder="Analytical Engines Ltd" />
        </div>
        <div>
          <Label>Role / title</Label>
          <Input value={form.role} onChange={set("role")} placeholder="CTO" />
        </div>
        <div>
          <Label>Tags (comma-separated)</Label>
          <Input value={form.tags} onChange={set("tags")} placeholder="client, priority" />
        </div>
        <div className="sm:col-span-2">
          <Label>Relationship (one line)</Label>
          <Input value={form.relationship} onChange={set("relationship")} placeholder="Met at the March conference; interested in the automation offer" />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={set("notes")} placeholder="Anything worth remembering…" />
        </div>
        <div>
          <Label>Follow up on</Label>
          <Input value={form.followUpAt} onChange={set("followUpAt")} type="date" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? <Spinner className="mr-1.5" /> : null}
          {editing === "new" ? "Add contact" : "Save changes"}
        </Button>
        <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, company, tag…"
          className="max-w-xs"
        />
        {dueCount > 0 && (
          <Badge tone="warning">
            <BellRing className="h-3 w-3" /> {dueCount} follow-up{dueCount > 1 ? "s" : ""} due
          </Badge>
        )}
        <div className="ml-auto">
          <Button onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> New contact
          </Button>
        </div>
      </div>

      {editing === "new" && editForm}

      {initial.length === 0 && editing !== "new" ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No contacts yet"
          description="Add the people you work with — Aria will track follow-ups and keep relationship notes in one place."
          action={
            <Button onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> Add your first contact
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((c) =>
            editing === c.id ? (
              <React.Fragment key={c.id}>{editForm}</React.Fragment>
            ) : (
              <Card key={c.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{c.full_name}</p>
                      {c.role && <span className="text-sm text-muted-foreground">{c.role}</span>}
                      {followUpDue(c) && (
                        <Badge tone="warning">
                          <BellRing className="h-3 w-3" /> Follow up
                        </Badge>
                      )}
                      {(c.tags ?? []).map((t) => (
                        <Badge key={t} tone="muted">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {c.company && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" /> {c.company}
                        </span>
                      )}
                      {c.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" /> {c.email}
                        </span>
                      )}
                      {c.last_interaction_at && <span>Last contact {formatDate(c.last_interaction_at)}</span>}
                      {c.follow_up_at && !followUpDue(c) && <span>Follow up {formatDate(c.follow_up_at)}</span>}
                    </div>
                    {c.relationship && <p className="mt-2 text-sm">{c.relationship}</p>}
                    {c.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {followUpDue(c) && (
                      <Button size="sm" variant="outline" onClick={() => markTalkedToday(c)} disabled={busy}>
                        Done today
                      </Button>
                    )}
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Edit ${c.full_name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(c)}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Delete ${c.full_name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ),
          )}
        </div>
      )}
    </div>
  );
}
