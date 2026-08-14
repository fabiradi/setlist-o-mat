import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "content-type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) return json({ error: "Unauthorized" }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return json({ error: "Unauthorized" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: profile } = await adminClient.from("profiles").select("is_app_admin").eq("id", callerData.user.id).single();
  if (!profile?.is_app_admin) return json({ error: "Forbidden" }, 403);

  const { userId } = await request.json().catch(() => ({ userId: null }));
  if (typeof userId !== "string") return json({ error: "userId is required" }, 400);
  if (userId === callerData.user.id) return json({ error: "Das eigene Admin-Konto kann hier nicht gelöscht werden." }, 400);

  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
