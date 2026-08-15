import { withSupabase } from "npm:@supabase/server@1.4.1";

const json = (body: unknown, status = 200) => Response.json(body, { status });

const createTemporaryPassword = (length = 18) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$";
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomBytes, (value) => alphabet[value % alphabet.length]).join("");
};

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const callerId = context.userClaims?.id;
    if (!callerId) return json({ error: "Der angemeldete Benutzer konnte nicht ermittelt werden." }, 401);

    const adminClient = context.supabaseAdmin;
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("is_app_admin")
      .eq("id", callerId)
      .single();
    if (callerProfileError) return json({ error: callerProfileError.message }, 400);
    if (!callerProfile?.is_app_admin) return json({ error: "Diese Funktion ist nur für Administratoren verfügbar." }, 403);

    const { userId } = await request.json().catch(() => ({ userId: null }));
    if (typeof userId !== "string") return json({ error: "userId is required" }, 400);
    if (userId === callerId) return json({ error: "Für dein eigenes Admin-Konto nutzt du bitte die Profil-Einstellungen." }, 400);

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
  }),
};
