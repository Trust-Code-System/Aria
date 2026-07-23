import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Structural cross-user isolation guard.
 *
 * Aria's entire tenant boundary is Row Level Security: a user may only touch
 * rows in workspaces they belong to, enforced by `is_workspace_member`. The
 * silent-failure mode is a *new* migration that adds a workspace-scoped table
 * and forgets RLS or the membership policy — that table would then be readable
 * across tenants with no error anywhere. This test parses the real migrations
 * and fails if any table is left unprotected, so the leak is caught in CI
 * before it ships. It needs no database or credentials.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Only numbered migrations — skip `_combined.sql` and `_apply_*` helpers. */
function loadMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8")).join("\n");
}

const SQL = loadMigrationSql();

interface TableInfo {
  name: string;
  workspaceScoped: boolean;
}

/** Every `create table public.<name> ( ... );` with its column body. */
function parseTables(sql: string): TableInfo[] {
  const re = /create table\s+(?:if not exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\s*\);/gi;
  const tables: TableInfo[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    tables.push({ name: m[1], workspaceScoped: /\bworkspace_id\b/.test(m[2]) });
  }
  return tables;
}

/** Tables that ever get `enable row level security`. */
function rlsEnabledTables(sql: string): Set<string> {
  const re = /alter table\s+(?:if exists\s+)?public\.(\w+)\s+enable row level security/gi;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) set.add(m[1]);
  return set;
}

/**
 * Tables covered by an `is_workspace_member(...)` policy — via a direct
 * `create policy ... on public.<table>` whose body references the membership
 * function, or via a `do $$ ... foreach t in array[...] ... is_workspace_member`
 * loop that generates one policy per listed table.
 */
function isolatedTables(sql: string, known: Set<string>): Set<string> {
  const isolated = new Set<string>();

  // Direct per-table policies. The policy name may be a bare identifier or a
  // double-quoted string with spaces ("Users can view their own …").
  const policyRe = /create policy\s+(?:"[^"]+"|\w+)\s+on\s+public\.(\w+)([\s\S]*?);/gi;
  let m: RegExpExecArray | null;
  while ((m = policyRe.exec(sql))) {
    if (/is_workspace_member/.test(m[2])) isolated.add(m[1]);
  }

  // Loop-generated policies: any `do $$ ... $$;` block that mentions the
  // membership function scopes every table named in its array literals.
  const doRe = /do\s+\$\$([\s\S]*?)\$\$\s*;/gi;
  while ((m = doRe.exec(sql))) {
    const block = m[1];
    if (!/is_workspace_member/.test(block)) continue;
    for (const q of block.matchAll(/'(\w+)'/g)) {
      if (known.has(q[1])) isolated.add(q[1]);
    }
  }

  return isolated;
}

describe("RLS cross-user isolation (structural)", () => {
  const tables = parseTables(SQL);
  const rls = rlsEnabledTables(SQL);
  const known = new Set(tables.map((t) => t.name));
  const isolated = isolatedTables(SQL, known);

  it("discovers the expected core tables (parser sanity)", () => {
    for (const core of ["memories", "messages", "conversations", "connections", "contacts"]) {
      expect(known.has(core)).toBe(true);
    }
    // These must be recognised as workspace-scoped for the guard below to bite.
    const byName = new Map(tables.map((t) => [t.name, t]));
    expect(byName.get("memories")?.workspaceScoped).toBe(true);
    expect(byName.get("connections")?.workspaceScoped).toBe(true);
  });

  it("enables RLS on every table (no table ships with RLS off)", () => {
    const missing = tables.filter((t) => !rls.has(t.name)).map((t) => t.name);
    expect(missing, `tables missing "enable row level security": ${missing.join(", ")}`).toEqual([]);
  });

  it("scopes every workspace-scoped table by workspace membership", () => {
    const leaks = tables
      .filter((t) => t.workspaceScoped && !isolated.has(t.name))
      .map((t) => t.name);
    expect(
      leaks,
      `workspace-scoped tables with no is_workspace_member policy (cross-tenant leak risk): ${leaks.join(", ")}`,
    ).toEqual([]);
  });

  it("scopes the user-owned profiles table to the owner", () => {
    // profiles has no workspace_id; its tenant key is the user id itself.
    expect(/create policy\s+\w+\s+on\s+public\.profiles[\s\S]*?id = auth\.uid\(\)/i.test(SQL)).toBe(true);
  });
});
