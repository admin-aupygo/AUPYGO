/**
 * AUPYGO — Edge Function admin-create-staff
 * Crée un compte Staff + génère le lien mot de passe + envoie l'invitation par email.
 *
 * Body: { email, display_name, role, staff_country?, staff_city? }
 * Secrets: RESEND_API_KEY, STAFF_DELETE_FROM_EMAIL (ou STAFF_INVITE_FROM_EMAIL)
 * SQL requis: SUPABASE_ADMIN_CREATE_STAFF.sql (admin_provision_staff_profile)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = [
  "major_staff",
  "sergent_staff",
  "major_moderateur",
  "sergent_moderateur",
];

const SITE_URL = Deno.env.get("SITE_URL") || "https://aupygo.com";
const CONTACT = "contact@aupygo.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    major_staff: "Major Staff",
    sergent_staff: "Sergent Staff",
    major_moderateur: "Major Modérateur",
    sergent_moderateur: "Sergent Modérateur",
  };
  return map[role] || role;
}

async function sendInviteEmail(opts: {
  to: string;
  displayName: string;
  role: string;
  setupLink: string;
}) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from =
    Deno.env.get("STAFF_INVITE_FROM_EMAIL") ||
    Deno.env.get("STAFF_DELETE_FROM_EMAIL") ||
    `AUPYGO <${CONTACT}>`;

  if (!key) {
    return { ok: false, error: "EMAIL_NOT_CONFIGURED" };
  }

  const grade = roleLabel(opts.role);
  const subject = "AUPYGO — Invitation Staff : active ton compte";
  const text =
    `Bonjour ${opts.displayName},\n\n` +
    `Tu as été invité(e) à rejoindre l'équipe Staff AUPYGO en tant que ${grade}.\n\n` +
    `Pour activer ton compte, ouvre ce lien (valable environ 1 heure, usage unique) et choisis ton mot de passe :\n\n` +
    `${opts.setupLink}\n\n` +
    `Si tu n'attendais pas ce message, tu peux l'ignorer.\n\n` +
    `Des questions ? Écris-nous à ${CONTACT}.\n\n` +
    `L'équipe AUPYGO\n`;

  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#0f172a;max-width:560px">` +
    `<p>Bonjour <strong>${opts.displayName}</strong>,</p>` +
    `<p>Tu as été invité(e) à rejoindre l'équipe Staff AUPYGO en tant que <strong>${grade}</strong>.</p>` +
    `<p>Pour activer ton compte, clique sur le bouton ci-dessous (lien valable environ <strong>1 heure</strong>, usage unique) et choisis ton mot de passe :</p>` +
    `<p style="margin:24px 0">` +
    `<a href="${opts.setupLink}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">` +
    `Activer mon compte Staff</a></p>` +
    `<p style="font-size:13px;color:#64748b">Si le bouton ne fonctionne pas, copie ce lien dans ton navigateur :<br/>` +
    `<span style="word-break:break-all">${opts.setupLink}</span></p>` +
    `<p>Si tu n'attendais pas ce message, tu peux l'ignorer.</p>` +
    `<p>Des questions ? Écris-nous à <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>` +
    `<p>L'équipe AUPYGO</p>` +
    `</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      reply_to: CONTACT,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("[admin-create-staff] Resend error", res.status, t);
    return { ok: false, error: "EMAIL_SEND_FAILED", detail: t.slice(0, 300) };
  }
  return { ok: true };
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
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim();
    const role = String(body.role || "").trim();
    const staffCountry = String(body.staff_country || "").trim() || null;
    const staffCity = String(body.staff_city || "").trim() || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "invalid_email" }, 400);
    }
    if (displayName.length < 2) {
      return json({ error: "invalid_display_name" }, 400);
    }
    if (ALLOWED_ROLES.indexOf(role) === -1) {
      return json({ error: "invalid_role" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // 1) Créer l'utilisateur Auth
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { display_name: displayName, invited_as: role },
    });

    if (createErr || !created?.user) {
      console.error("[admin-create-staff] createUser", createErr);
      return json({ error: "create_failed", detail: createErr?.message }, 400);
    }

    const userId = created.user.id;

    // 2) Profil via RPC SECURITY DEFINER (contourne le trigger anti-escalade pour service_role)
    const { data: prov, error: provErr } = await admin.rpc(
      "admin_provision_staff_profile",
      {
        p_id: userId,
        p_display_name: displayName,
        p_role: role,
        p_staff_country: staffCountry,
        p_staff_city: staffCity,
      },
    );

    if (provErr) {
      console.error("[admin-create-staff] provision", provErr);
      try {
        await admin.auth.admin.deleteUser(userId);
      } catch (_) { /* ignore */ }
      return json({
        error: "profile_failed",
        detail: provErr.message,
        code: provErr.code,
      }, 400);
    }

    // 3) Lien recovery
    let setupLink: string | null = null;
    let linkError: string | null = null;
    try {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo: `${SITE_URL.replace(/\/$/, "")}/`,
        },
      });
      if (linkErr) {
        linkError = linkErr.message;
        console.error("[admin-create-staff] generateLink", linkErr);
      } else {
        const props = linkData?.properties as { action_link?: string } | undefined;
        setupLink = props?.action_link || null;
        if (!setupLink) linkError = "empty_action_link";
      }
    } catch (e) {
      linkError = String((e as Error)?.message || e);
    }

    // 4) Email invitation
    let emailSent = false;
    let emailError: string | null = null;
    if (setupLink) {
      const mail = await sendInviteEmail({
        to: email,
        displayName,
        role,
        setupLink,
      });
      emailSent = !!mail.ok;
      if (!mail.ok) emailError = mail.error || "EMAIL_SEND_FAILED";
    } else {
      emailError = "NO_SETUP_LINK";
    }

    return json({
      ok: true,
      user_id: userId,
      provision: prov,
      setup_link: setupLink,
      link_error: linkError,
      email_sent: emailSent,
      email_error: emailError,
      email_to: email,
    });
  } catch (e) {
    console.error(e);
    return json({
      error: "server_error",
      message: String((e as Error)?.message || e),
    }, 500);
  }
});
