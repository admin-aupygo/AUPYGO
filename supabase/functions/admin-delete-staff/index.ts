/**
 * AUPYGO — Edge Function admin-delete-staff
 * POST { action: "request"|"confirm", target_id, challenge_id?, code? }
 * Secrets: RESEND_API_KEY, STAFF_DELETE_NOTIFY_TO, STAFF_DELETE_FROM_EMAIL
 *
 * confirm :
 *  1) lit email Auth de la cible (AVANT toute suppression)
 *  2) envoie le mail de notification à l'ex-agent (+ copie Amiral en BCC si possible)
 *  3) valide le code + purge (RPC archive + données)
 *  4) supprime auth.users si besoin
 *
 * Important Resend : avec onboarding@resend.dev, seuls les envois vers l'email
 * du compte Resend sont acceptés. Pour notifier n'importe quel agent, il faut
 * un domaine vérifié et STAFF_DELETE_FROM_EMAIL = noreply@ce-domaine.com
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

async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  bcc?: string[];
}) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from =
    Deno.env.get("STAFF_DELETE_FROM_EMAIL") ||
    "AUPYGO <onboarding@resend.dev>";
  if (!key) {
    console.error("[admin-delete-staff] RESEND_API_KEY manquant");
    return { ok: false, error: "EMAIL_NOT_CONFIGURED", detail: "missing RESEND_API_KEY" };
  }

  const payload: Record<string, unknown> = {
    from,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  };
  if (opts.bcc && opts.bcc.length) payload.bcc = opts.bcc;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    console.error("[admin-delete-staff] Resend error", res.status, bodyText, "from=", from, "to=", opts.to);
    return {
      ok: false,
      error: "EMAIL_SEND_FAILED",
      detail: bodyText.slice(0, 500),
      status: res.status,
      from,
    };
  }
  console.log("[admin-delete-staff] Resend OK", bodyText.slice(0, 200));
  return { ok: true, detail: bodyText.slice(0, 200) };
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

      const mail = await sendEmail({ to: notifyTo, subject, html, text });
      if (!mail.ok) {
        return json({
          error: mail.error || "email_failed",
          detail: mail.detail,
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

      // --- 1) Lire email + profil AVANT toute suppression ---
      let targetEmail: string | null = null;
      let displayName = "";
      let roleLabel = "staff";

      try {
        const { data: authUser, error: guErr } = await admin.auth.admin.getUserById(targetId);
        if (guErr) console.warn("[admin-delete-staff] getUserById error", guErr);
        targetEmail = authUser?.user?.email?.trim() || null;
        console.log("[admin-delete-staff] targetEmail=", targetEmail ? targetEmail.replace(/(.{2}).+(@.+)/, "$1***$2") : "NULL");
      } catch (e) {
        console.warn("[admin-delete-staff] getUserById exception", e);
      }

      const { data: prof } = await admin
        .from("profiles")
        .select("display_name, role, staff_branch, staff_country, staff_city")
        .eq("id", targetId)
        .maybeSingle();
      displayName = prof?.display_name || "";
      roleLabel = String(prof?.role || "staff");

      // --- 2) Mail de notification AVANT la purge (tant que le compte existe encore) ---
      let notifySent = false;
      let notifyError: string | null = null;

      if (!targetEmail) {
        notifyError = "NO_TARGET_EMAIL";
        console.error("[admin-delete-staff] Pas d'email Auth pour", targetId);
      } else {
        const notice = buildStaffRemovalNotice(displayName, roleLabel);
        // BCC Amiral pour contrôle (optionnel, ignore si même adresse)
        const bcc = notifyTo && notifyTo.toLowerCase() !== targetEmail.toLowerCase()
          ? [notifyTo]
          : undefined;

        const mail = await sendEmail({
          to: targetEmail,
          subject: notice.subject,
          html: notice.html,
          text: notice.text,
          bcc,
        });
        notifySent = !!mail.ok;
        if (!mail.ok) {
          notifyError = String(mail.detail || mail.error || "EMAIL_SEND_FAILED");
          console.error("[admin-delete-staff] notice failed", notifyError);
        }
      }

      // --- 3) RPC : archive + purge données ---
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

      // --- 4) Compléter l'archive ---
      try {
        await admin
          .from("staff_deleted_archive")
          .update({
            email: targetEmail,
            notify_email_sent: notifySent,
            notes: notifyError ? `notify_error: ${notifyError}`.slice(0, 500) : null,
          })
          .eq("former_user_id", targetId);
      } catch (e) {
        console.warn("[admin-delete-staff] archive update", e);
      }

      // --- 5) Auth delete si besoin ---
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
            notify_error: notifyError,
            target_email_masked: targetEmail
              ? targetEmail.replace(/(.{2}).+(@.+)/, "$1***$2")
              : null,
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
        notify_error: notifyError,
        target_email_masked: targetEmail
          ? targetEmail.replace(/(.{2}).+(@.+)/, "$1***$2")
          : null,
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
