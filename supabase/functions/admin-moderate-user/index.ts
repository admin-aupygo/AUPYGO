/**
 * AUPYGO — Edge Function admin-moderate-user
 * Actions : warn | ban | unban
 * Autorisé : Amiral OU Major Modérateur
 *
 * Body JSON :
 *   { action, target_id, reason?, checklist_version?, profile_incomplete?, brevo_profile_mail_acknowledged? }
 *
 * Secrets : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto)
 * SQL optionnel : colonnes profiles.is_banned, moderation_warnings, moderation_logs
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function isModeratorRole(role: string | null | undefined, isAdmin: boolean | null | undefined) {
  if (isAdmin === true) return true;
  const r = String(role || "").toLowerCase();
  return r === "amiral" || r === "admin" || r === "admin_general" || r === "major_moderateur";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "not_authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "not_authenticated" }, 401);
    }
    const actorId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: actorProfile, error: actorErr } = await admin
      .from("profiles")
      .select("id, role, is_admin, display_name")
      .eq("id", actorId)
      .maybeSingle();

    if (actorErr || !actorProfile || !isModeratorRole(actorProfile.role, actorProfile.is_admin)) {
      return json({ error: "forbidden", detail: "Major Modérateur ou Amiral uniquement" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim().toLowerCase();
    const targetId = String(body.target_id || "").trim();
    const reason = String(body.reason || "").trim();
    const checklistVersion = String(body.checklist_version || "v1");
    const profileIncomplete = !!body.profile_incomplete;
    const brevoAck = body.brevo_profile_mail_acknowledged !== false;

    if (!targetId) return json({ error: "invalid_target" }, 400);
    if (["warn", "ban", "unban"].indexOf(action) === -1) {
      return json({ error: "invalid_action" }, 400);
    }
    if (targetId === actorId) {
      return json({ error: "cannot_moderate_self" }, 400);
    }
    if ((action === "warn" || action === "ban") && reason.length < 8) {
      return json({ error: "reason_required" }, 400);
    }

    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, display_name, role, is_admin, moderation_warnings, is_banned")
      .eq("id", targetId)
      .maybeSingle();

    if (tErr || !target) {
      return json({ error: "target_not_found" }, 404);
    }

    // Ne jamais sanctionner un Staff / Amiral via cet outil
    if (
      target.is_admin === true ||
      ["amiral", "admin", "admin_general", "major_staff", "sergent_staff", "major_moderateur", "sergent_moderateur"].indexOf(
        String(target.role || "").toLowerCase(),
      ) !== -1
    ) {
      return json({ error: "cannot_moderate_staff" }, 403);
    }

    let warnings = Number(target.moderation_warnings || 0) || 0;
    let banned = target.is_banned === true;

    if (action === "warn") {
      warnings += 1;
      const { error: upErr } = await admin
        .from("profiles")
        .update({
          moderation_warnings: warnings,
          moderation_last_reason: reason.slice(0, 500),
          moderation_last_at: new Date().toISOString(),
        })
        .eq("id", targetId);
      if (upErr) {
        // colonnes absentes : on log seulement
        console.warn("[admin-moderate-user] profile update warn", upErr.message);
      }
    }

    if (action === "ban") {
      const { error: banErr } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: "876000h", // ~100 ans
      });
      if (banErr) {
        console.error("[admin-moderate-user] ban", banErr);
        return json({ error: "ban_failed", detail: banErr.message }, 500);
      }
      banned = true;
      await admin
        .from("profiles")
        .update({
          is_banned: true,
          moderation_last_reason: reason.slice(0, 500),
          moderation_last_at: new Date().toISOString(),
        })
        .eq("id", targetId);
    }

    if (action === "unban") {
      const { error: unbanErr } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: "none",
      });
      if (unbanErr) {
        console.error("[admin-moderate-user] unban", unbanErr);
        return json({ error: "unban_failed", detail: unbanErr.message }, 500);
      }
      banned = false;
      await admin
        .from("profiles")
        .update({
          is_banned: false,
          moderation_last_reason: reason.slice(0, 500) || "unban",
          moderation_last_at: new Date().toISOString(),
        })
        .eq("id", targetId);
    }

    // Log best-effort
    try {
      await admin.from("moderation_logs").insert({
        actor_id: actorId,
        actor_role: actorProfile.role,
        target_id: targetId,
        action,
        reason: reason.slice(0, 1000),
        checklist_version: checklistVersion,
        profile_incomplete: profileIncomplete,
        brevo_profile_mail_ack: brevoAck,
        meta: {
          target_name: target.display_name,
          actor_name: actorProfile.display_name,
        },
      });
    } catch (logErr) {
      console.warn("[admin-moderate-user] log insert", logErr);
    }

    return json({
      ok: true,
      action,
      target_id: targetId,
      warnings,
      is_banned: banned,
    });
  } catch (e) {
    console.error("[admin-moderate-user]", e);
    return json({
      error: "server_error",
      message: String((e as Error)?.message || e),
    }, 500);
  }
});
