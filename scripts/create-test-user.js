/**
 * Create a test user via the Supabase Admin API (bypasses rate limits).
 * Then verify login works via the REST API.
 */
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_EMAIL = "ariatest_happy@test.local";
const TEST_PASSWORD = "TestPass123!";

async function main() {
  console.log("=== Creating Test User ===\n");

  // 1. Delete existing test user if any
  const { data: users } = await admin.auth.admin.listUsers();
  const existing = users?.users?.find(u => u.email === TEST_EMAIL);
  if (existing) {
    console.log(`Deleting existing test user: ${existing.id}`);
    await admin.auth.admin.deleteUser(existing.id);
  }

  // 2. Create a new test user (auto-confirmed, bypasses rate limits)
  const { data: newUser, error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true, // Skip email confirmation
  });

  if (error) {
    console.error("Failed to create user:", error.message);
    process.exit(1);
  }

  console.log(`✅ Created user: ${newUser.user.id} (${newUser.user.email})`);
  console.log(`   Confirmed: ${newUser.user.email_confirmed_at ? "yes" : "no"}`);

  // 3. Test login via the anon client
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: session, error: loginErr } = await anon.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (loginErr) {
    console.error("Login failed:", loginErr.message);
    process.exit(1);
  }

  console.log(`✅ Login successful! Session token: ${session.session.access_token.slice(0, 20)}...`);
  console.log(`   User ID: ${session.user.id}`);

  // 4. Check if the new-user trigger created the workspace
  const { data: workspaces, error: wsErr } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", session.user.id);

  if (wsErr) {
    console.log(`⚠️  Could not check workspaces: ${wsErr.message}`);
  } else if (workspaces && workspaces.length > 0) {
    console.log(`✅ Workspace auto-created: ${workspaces[0].workspace_id}`);
  } else {
    console.log("⚠️  No workspace found — the handle_new_user trigger may not be set up");
  }

  // 5. Test project creation via REST
  const { data: project, error: projErr } = await admin
    .from("projects")
    .insert({
      workspace_id: workspaces?.[0]?.workspace_id,
      user_id: session.user.id,
      name: "Test Project",
      description: "Created by the happy-path test script",
    })
    .select("id")
    .single();

  if (projErr) {
    console.log(`⚠️  Project creation failed: ${projErr.message}`);
  } else {
    console.log(`✅ Project created: ${project.id}`);
  }

  console.log("\n=== Test User Ready ===");
  console.log(`Email: ${TEST_EMAIL}`);
  console.log(`Password: ${TEST_PASSWORD}`);
  console.log("Use these credentials to sign in at http://localhost:3001/login");
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
