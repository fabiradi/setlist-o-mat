import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "content-type": "application/json" },
});

const createTemporaryPassword = (length = 18) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$";
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomBytes, (value) => alphabet[value % alphabet.length]).join("");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !token) {
    console.warn("admin-reset-password: missing environment or bearer token");
    return json({ error: "Unauthorized" }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) {
    console.warn("admin-reset-password: bearer token could not be verified");
    return json({ error: "Unauthorized" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from("profiles")
    .select("is_app_admin")
    .eq("id", callerData.user.id)
    .single();
  if (callerProfileError || !callerProfile?.is_app_admin) return json({ error: "Forbidden" }, 403);

  const { userId } = await request.json().catch(() => ({ userId: null }));
  if (typeof userId !== "string") return json({ error: "userId is required" }, 400);
  if (userId === callerData.user.id) return json({ error: "Für dein eigenes Admin-Konto nutzt du bitte die Profil-Einstellungen." }, 400);

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id, is_app_admin")
    .eq("id", userId)
    .maybeSingle();
  if (targetError) return json({ error: targetError.message }, 400);
  if (!targetProfile) return json({ error: "Benutzerkonto nicht gefunden." }, 404);
  if (targetProfile.is_app_admin) return json({ error: "Das Passwort anderer Admin-Konten kann hier nicht zurückgesetzt werden." }, 400);

  const temporaryPassword = createTemporaryPassword();
  const { error: profileUpdateError } = await adminClient
    .from("profiles")
    .update({ password_change_required: true })
    .eq("id", userId);
  if (profileUpdateError) return json({ error: profileUpdateError.message }, 400);

  const { error: passwordUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
  });
  if (passwordUpdateError) {
    await adminClient.from("profiles").update({ password_change_required: false }).eq("id", userId);
    return json({ error: passwordUpdateError.message }, 400);
  }

  return json({ ok: true, temporaryPassword });
});
