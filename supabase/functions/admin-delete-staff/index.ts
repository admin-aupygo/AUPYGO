/**
 * AUPYGO — Edge Function admin-delete-staff
 * POST { action: "request"|"confirm", target_id, challenge_id?, code? }
 * Secrets: RESEND_API_KEY, STAFF_DELETE_NOTIFY_TO, STAFF_DELETE_FROM_EMAIL
 *
 * confirm :
 *  1) lit email Auth de la cible
 *  2) valide le code + purge (RPC)
 *  3) archive email + flag notify
 *  4) envoie un mail de notification bienveillant à l'ex-agent
 *  5) supprime auth.users si besoin
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode6(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, "0");
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from =
    Deno.env.get("STAFF_DELETE_FROM_EMAIL") ||
    "AUPYGO <onboarding@resend.dev>";
  if (!key) {
    console.error("[admin-delete-staff] RESEND_API_KEY manquant");
    return { ok: false, error: "EMAIL_NOT_CONFIGURED" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[admin-delete-staff] Resend error", res.status, t);
    return { ok: false, error: "EMAIL_SEND_FAILED" };
  }
  return { ok: true };
}

function buildStaffRemovalNotice(name: string, role: string) {
  const safeName = name || "membre de l'équipe";
  const safeRole = role || "staff";
  const subject = "AUPYGO — Fin de votre accès Staff";
  const text =
    `Bonjour ${safeName},\n\n` +
    `Nous vous informons que votre accès Staff sur AUPYGO (${safeRole}) a été retiré, ` +
    `conformément aux échanges et décisions d'organisation qui ont précédé cette mesure.\n\n` +
    `Conséquences concrètes :\n` +
    `• votre compte Staff et les données associées à ce rôle ont été supprimés ;\n` +
    `• vous ne pouvez plus vous connecter avec cette adresse e-mail sur ce compte ;\n` +
    `• les contenus opérationnels liés à votre profil Staff (messages internes, participations liées au compte, etc.) ont été effacés.\n\n` +
    `Cette démarche vise à protéger la communauté, l'équipe et le bon fonctionnement de la plateforme. ` +
    `Elle n'a pas pour objet de porter atteinte à votre dignité : nous vous remercions pour le temps que vous avez pu consacrer à AUPYGO.\n\n` +
    `Si vous estimez qu'il s'agit d'une erreur, ou si vous avez une question relative à vos données, ` +
    `vous pouvez nous écrire à aupygo@protonmail.com. Nous traiterons votre message avec attention.\n\n` +
    `Bien cordialement,\n` +
    `L'équipe AUPYGO\n`;

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a;max-width:560px">` +
    `<p>Bonjour <strong>${safeName}</strong>,</p>` +
    `<p>Nous vous informons que votre accès Staff sur AUPYGO (<em>${safeRole}</em>) a été retiré, ` +
    `conformément aux échanges et décisions d'organisation qui ont précédé cette mesure.</p>` +
    `<p><strong>Conséquences concrètes :</strong></p>` +
    `<ul>` +
    `<li>votre compte Staff et les données associées à ce rôle ont été supprimés ;</li>` +
    `<li>vous ne pouvez plus vous connecter avec cette adresse e-mail sur ce compte ;</li>` +
    `<li>les contenus opérationnels liés à votre profil Staff (messages internes, participations liées au compte, etc.) ont été effacés.</li>` +
    `</ul>` +
    `<p>Cette démarche vise à protéger la communauté, l'équipe et le bon fonctionnement de la plateforme. ` +
    `Elle n'a pas pour objet de porter atteinte à votre dignité : nous vous remercions pour le temps que vous avez pu consacrer à AUPYGO.</p>` +
    `<p>Si vous estimez qu'il s'agit d'une erreur, ou si vous avez une question relative à vos données, ` +
    `vous pouvez nous écrire à <a href="mailto:aupygo@protonmail.com">aupygo@protonmail.com</a>. ` +
    `Nous traiterons votre message avec attention.</p>` +
    `<p>Bien cordialement,<br/>L'équipe AUPYGO</p>` +
    `</div>`;

  return { subject, text, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "not_authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "not_authenticated" }, 401);
    }

    const { data: isAmiral, error: amErr } = await userClient.rpc("is_amiral");
    if (amErr || isAmiral !== true) {
      return json({ error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const targetId = String(body.target_id || "");

    if (!targetId || !/^[0-9a-f-]{36}$/i.test(targetId)) {
      return json({ error: "invalid_target" }, 400);
    }
    if (targetId === userData.user.id) {
      return json({ error: "invalid_target" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: eligible } = await admin.rpc("is_deletable_staff_agent", {
      p_id: targetId,
    });
    if (eligible !== true) {
      return json({ error: "not_staff_agent" }, 403);
    }

    const notifyTo =
      Deno.env.get("STAFF_DELETE_NOTIFY_TO") || "aupygo@protonmail.com";

    if (action === "request") {
      const code = randomCode6();
      const codeHash = await sha256Hex(code);

      const { data: ch, error: chErr } = await userClient.rpc(
        "admin_create_staff_delete_challenge",
        { p_target_id: targetId, p_code_hash: codeHash, p_ttl_seconds: 900 },
      );
      if (chErr) {
        console.error(chErr);
        return json({ error: chErr.message || "challenge_failed" }, 400);
      }

      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, role")
        .eq("id", targetId)
        .maybeSingle();

      const name = prof?.display_name || targetId;
      const role = prof?.role || "staff";
      const subject = `[AUPYGO] Code suppression agent Staff — ${name}`;
      const text =
        `Code de sécurité pour supprimer définitivement l'agent Staff « ${name} » (${role}).\n\n` +
        `Code : ${code}\n\n` +
        `Valable 15 minutes. Si tu n'as pas demandé cette suppression, ignore ce message.\n`;
      const html =
        `<p>Code de sécurité pour supprimer définitivement l'agent Staff <strong>${name}</strong> (${role}).</p>` +
        `<p style="font-size:28px;font-weight:800;letter-spacing:4px">${code}</p>` +
        `<p>Valable <strong>15 minutes</strong>.</p>`;

      const mail = await sendEmail(notifyTo, subject, html, text);
      if (!mail.ok) {
        return json({
          error: mail.error || "email_failed",
          challenge_id: ch?.challenge_id,
        }, 502);
      }

      return json({
        ok: true,
        challenge_id: ch?.challenge_id,
        expires_at: ch?.expires_at,
        email_to: notifyTo,
      });
    }

    if (action === "confirm") {
      const challengeId = String(body.challenge_id || "");
      const code = String(body.code || "").trim();
      if (!challengeId || !/^\d{6}$/.test(code)) {
        return json({ error: "invalid_code" }, 400);
      }
      const codeHash = await sha256Hex(code);

      // 1) Email Auth AVANT suppression
      let targetEmail: string | null = null;
      let displayName = "";
      let roleLabel = "staff";
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(targetId);
        targetEmail = authUser?.user?.email || null;
      } catch (e) {
        console.warn("[admin-delete-staff] getUserById", e);
      }
      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, role")
        .eq("id", targetId)
        .maybeSingle();
      displayName = prof?.display_name || "";
      roleLabel = String(prof?.role || "staff");

      // 2) RPC : archive minimale + purge données + tentative auth
      const { data: result, error: confErr } = await userClient.rpc(
        "admin_confirm_staff_delete",
        {
          p_target_id: targetId,
          p_challenge_id: challengeId,
          p_code_hash: codeHash,
        },
      );
      if (confErr) {
        const msg = confErr.message || "";
        if (/INVALID_CODE/i.test(msg)) return json({ error: "invalid_code" }, 403);
        if (/EXPIRED/i.test(msg)) return json({ error: "challenge_expired" }, 400);
        if (/ALREADY_USED/i.test(msg)) return json({ error: "challenge_used" }, 400);
        console.error(confErr);
        return json({ error: confErr.message || "confirm_failed" }, 400);
      }

      if (result?.display_name) displayName = result.display_name;
      if (result?.role) roleLabel = result.role;

      // 3) Compléter l'archive (email + flag notification)
      let notifySent = false;
      if (targetEmail) {
        try {
          await admin
            .from("staff_deleted_archive")
            .update({ email: targetEmail })
            .eq("former_user_id", targetId)
            .order("deleted_at", { ascending: false })
            .limit(1);
        } catch (e) {
          console.warn("[admin-delete-staff] archive email update", e);
        }

        // 4) Mail à l'ex-agent (bienveillant / informatif)
        const notice = buildStaffRemovalNotice(displayName, roleLabel);
        const mail = await sendEmail(
          targetEmail,
          notice.subject,
          notice.html,
          notice.text,
        );
        notifySent = !!mail.ok;
        if (!mail.ok) {
          console.error("[admin-delete-staff] notice email failed", mail.error);
        } else {
          try {
            await admin
              .from("staff_deleted_archive")
              .update({ notify_email_sent: true })
              .eq("former_user_id", targetId)
              .order("deleted_at", { ascending: false })
              .limit(1);
          } catch (_) { /* ignore */ }
        }
      }

      // 5) Suppression Auth si la RPC n'a pas pu
      let authDeleted = result?.auth_deleted === true;
      if (!authDeleted) {
        const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
        if (delErr) {
          console.error("auth.admin.deleteUser", delErr);
          return json({
            ok: true,
            profile_deleted: true,
            auth_deleted: false,
            notify_email_sent: notifySent,
            warning: delErr.message,
            target_id: targetId,
          });
        }
        authDeleted = true;
      } else {
        try {
          await admin.auth.admin.deleteUser(targetId);
        } catch (_) { /* déjà supprimé */ }
      }

      return json({
        ok: true,
        profile_deleted: true,
        auth_deleted: authDeleted,
        notify_email_sent: notifySent,
        target_id: targetId,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return json({
      error: "server_error",
      message: String((e as Error)?.message || e),
    }, 500);
  }
});
