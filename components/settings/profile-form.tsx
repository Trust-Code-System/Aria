"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export interface EditableProfile {
  preferredName: string;
  company: string;
  roleTitle: string;
  signature: string;
  timezone: string;
  language: string;
  historyRetrievalEnabled: boolean;
}

export function ProfileForm({ initial }: { initial: EditableProfile }) {
  const [value, setValue] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const { success, error } = useToast();
  const field = (key: keyof EditableProfile) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValue((current) => ({ ...current, [key]: event.target.value }));

  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save your profile.");
      success("Profile updated");
    } catch (cause) {
      error("Could not update profile", cause instanceof Error ? cause.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Preferred name</Label><Input value={value.preferredName} onChange={field("preferredName")} /></div>
        <div><Label>Company</Label><Input value={value.company} onChange={field("company")} /></div>
        <div><Label>Role</Label><Input value={value.roleTitle} onChange={field("roleTitle")} /></div>
        <div><Label>Timezone</Label><Input value={value.timezone} onChange={field("timezone")} /></div>
        <div><Label>Language</Label><Input value={value.language} onChange={field("language")} /></div>
      </div>
      <div><Label>Signature</Label><Textarea value={value.signature} onChange={field("signature")} placeholder="Optional closing Aria can use in drafts" /></div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={value.historyRetrievalEnabled} onChange={(event) => setValue((current) => ({ ...current, historyRetrievalEnabled: event.target.checked }))} />
        <span><span className="font-medium">Allow explicit prior-chat lookup</span><span className="block text-xs text-muted-foreground">Aria only searches other conversations when you explicitly refer to prior chats.</span></span>
      </label>
      <Button onClick={() => void save()} disabled={busy}>{busy ? "Savingâ€¦" : "Save profile"}</Button>
    </div>
  );
}
