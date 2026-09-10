// Lets a signed-in user permanently delete their own account (App Store
// 5.1.1(v) / Google Play account-deletion requirement).
// Deploy: supabase functions deploy delete-account
// Caller must be authenticated; the Authorization header is forwarded
// automatically by supabase.functions.invoke.
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically by Supabase.)
//
// Two steps: 1) delete_own_account() RPC anonymizes the profile row (run as
// the user, so it can't be called on anyone else's account), 2) the auth
// identity is banned with the service-role client so the caller can never
// log back in - we can't hard-delete auth.users because profiles.id is
// referenced (without cascade, by design) from match lineups, substitute
// approvals, and teams/leagues the user created or captained.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !anonKey || !supabaseUrl || !serviceRoleKey) return new Response("Unauthorized", { status: 401 });

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return new Response("Unauthorized", { status: 401 });

  const { error: rpcError } = await userClient.rpc("delete_own_account");
  if (rpcError) return new Response(`Deletion failed: ${rpcError.message}`, { status: 400 });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { error: banError } = await adminClient.auth.admin.updateUserById(userData.user.id, { ban_duration: "876000h" });
  if (banError) return new Response(`Account anonymized but sign-in lock failed: ${banError.message}`, { status: 500 });

  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { "content-type": "application/json" } });
});
