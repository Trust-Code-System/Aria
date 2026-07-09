import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/guards";
import { configured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";

const features = [
  { title: "Project spaces", body: "Organize work into projects with their own files, chats, and memory." },
  { title: "Knowledge base", body: "Upload PDFs, docs, and notes. Aria extracts, chunks, and embeds them." },
  { title: "Grounded answers", body: "Ask your files and get answers with real inline citations — no invented sources." },
  { title: "Web research", body: "Research the public web with structured, cited results." },
  { title: "Memory you control", body: "Approve stable preferences and project facts. Nothing sensitive is stored silently." },
  { title: "Reports & PDF", body: "Turn research and chats into polished, exportable documents." },
];

export default async function Landing() {
  // If already signed in, go straight to the workspace.
  if (configured.supabase) {
    const ctx = await getSessionContext();
    if (ctx) redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <BrandMark size={32} />
          <span className="text-lg font-semibold tracking-tight">Aria</span>
        </div>
        <Link href="/login">
          <Button variant="outline" size="sm">
            Sign in
          </Button>
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <span className="mb-4 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Private · Source-grounded · Yours
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Your private AI workspace and second brain.
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground">
          Aria learns your projects, organizes your knowledge, researches the public web, and turns
          messy information into useful documents, plans, and decisions — with citations you can trust.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/login">
            <Button size="lg">Get started</Button>
          </Link>
          <Link href="/login?next=/dashboard">
            <Button size="lg" variant="outline">
              Open workspace
            </Button>
          </Link>
        </div>
        {!configured.supabase && (
          <p className="mt-6 max-w-md text-xs text-warning">
            Setup required: add your Supabase keys to <code>.env.local</code> to enable sign-in. See
            the README.
          </p>
        )}
      </section>

      <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

