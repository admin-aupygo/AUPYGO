/**
 * AUPYGO — Edge Function send-profile-reminders
 *
 * Envoie un rappel "complète ton profil" aux comptes créés il y a ~3 jours ou plus
 * (si le profil est encore incomplet et qu'aucun rappel n'a déjà été envoyé).
 *
 * Auth : header x-cron-secret = secret CRON_SECRET (ou Authorization Bearer)
 * Secrets Supabase à définir :
 *   - CRON_SECRET
 *   - BREVO_API_KEY
 *   - (auto) SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * From : AUPYGO <noreply@aupygo.com>
 * Reply-To : contact@aupygo.com
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function isIncomplete(p: {
  display_name?: string | null;
  age?: number | null;
  gender?: string | null;
  identity_locked?: boolean | null;
}): boolean {
  const name = String(p.display_name || "").trim();
  const age = Number(p.age);
  const gender = String(p.gender || "").trim();
  if (p.identity_locked === false) return true;
  if (!name || name.length < 2) return true;
  if (!age || age < 18) return true;
  if (!gender) return true;
  if (/^user[_-]?\d+$/i.test(name) || name === "Utilisateur" || name === "User") {
    return true;
  }
  return false;
}

type Lang = "fr" | "en" | "es";

function normalizeLang(raw: string | null | undefined): Lang {
  const s = String(raw || "fr").toLowerCase().slice(0, 2);
  if (s === "en") return "en";
  if (s === "es") return "es";
  return "fr";
}

function emailContent(lang: Lang): { subject: string; text: string; html: string } {
  if (lang === "en") {
    const text =
      "Hello,\n\n" +
      "A quick reminder from the AUPYGO team.\n\n" +
      "To use the service fully and remain visible on the platform, please complete your profile with all the required information in your account.\n\n" +
      "Log in at https://aupygo.com and finish your profile as soon as possible.\n\n" +
      "Under our Charter, an incomplete profile may lead to account restriction or deletion after the stated period.\n\n" +
      "If you encounter any difficulties, please contact the AUPYGO team: contact@aupygo.com\n\n" +
      "Thank you,\n" +
      "The AUPYGO Team\n" +
      "https://aupygo.com\n";
    return {
      subject: "AUPYGO — Reminder: please complete your profile",
      text,
      html: text.replace(/\n/g, "<br>"),
    };
  }
  if (lang === "es") {
    const text =
      "Hola,\n\n" +
      "Un breve recordatorio del equipo AUPYGO.\n\n" +
      "Para usar el servicio por completo y seguir visible en la plataforma, por favor completa tu perfil con toda la información solicitada en tu cuenta.\n\n" +
      "Inicia sesión en https://aupygo.com y finaliza tu perfil lo antes posible.\n\n" +
      "De conformidad con nuestra Carta, un perfil incompleto puede dar lugar a la restricción o eliminación de la cuenta tras el plazo previsto.\n\n" +
      "Si encuentras dificultades, por favor contacta con el servicio AUPYGO: contact@aupygo.com\n\n" +
      "Gracias,\n" +
      "El equipo AUPYGO\n" +
      "https://aupygo.com\n";
    return {
      subject: "AUPYGO — Recordatorio: completa tu perfil",
      text,
      html: text.replace(/\n/g, "<br>"),
    };
  }
  const text =
    "Bonjour,\n\n" +
    "Un petit rappel de la part de l'équipe AUPYGO.\n\n" +
    "Pour utiliser pleinement le service et rester visible sur la plateforme, merci de compléter entièrement ton profil (informations demandées dans ton compte).\n\n" +
    "Connecte-toi sur https://aupygo.com et finalise ton profil dès que possible.\n\n" +
    "Conformément à notre Charte, un profil incomplet peut entraîner la restriction ou la suppression du compte après le délai prévu.\n\n" +
    "Si tu rencontres des difficultés, merci de contacter notre service AUPYGO : contact@aupygo.com\n\n" +
    "Merci,\n" +
    "L'équipe AUPYGO\n" +
    "https://aupygo.com\n";
  return {
    subject: "AUPYGO — Rappel : complète ton profil",
    text,
    html: text.replace(/\n/g, "<br>"),
  };
}

async function sendBrevo(toEmail: string, lang: Lang, apiKey: string) {
  const content = emailContent(lang);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: "AUPYGO",
        email: "noreply@aupygo.com",
      },
      replyTo: {
        email: "contact@aupygo.com",
        name: "AUPYGO",
      },
      to: [{ email: toEmail }],
      subject: content.subject,
      textContent: content.text,
      htmlContent: `<!DOCTYPE html><html><body style="font-family:sans-serif;line-height:1.5;color:#222">${content.html}</body></html>`,
      tags: ["profile-reminder", "j3"],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`brevo_${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const headerSecret = req.headers.get("x-cron-secret") || "";
    const auth = req.headers.get("Authorization") || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!cronSecret || (headerSecret !== cronSecret && bearer !== cronSecret)) {
      return json({ error: "unauthorized" }, 401);
    }

    const brevoKey = Deno.env.get("BREVO_API_KEY") || "";
    if (!brevoKey) {
      return json({ error: "missing_BREVO_API_KEY" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fenêtre élargie : inscrits entre il y a 15 jours et il y a 3 jours (pour rattraper le stock)
    const now = Date.now();
    const fromIso = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString();
    const toIso = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error: qErr } = await admin
      .from("profiles")
      .select(
        "id, display_name, age, gender, identity_locked, preferred_language, created_at, profile_reminder_sent_at, is_banned",
      )
      .is("profile_reminder_sent_at", null)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(200);

    if (qErr) {
      console.error("[send-profile-reminders] query", qErr);
      return json({ error: "query_failed", detail: qErr.message }, 500);
    }

    const candidates = (rows || []).filter(
      (p) => p.is_banned !== true && isIncomplete(p),
    );

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const p of candidates) {
      try {
        const { data: userData, error: uErr } = await admin.auth.admin.getUserById(
          p.id,
        );
        if (uErr || !userData?.user?.email) {
          skipped++;
          continue;
        }
        const email = userData.user.email;
        const lang = normalizeLang(p.preferred_language);

        await sendBrevo(email, lang, brevoKey);

        const { error: upErr } = await admin
          .from("profiles")
          .update({ profile_reminder_sent_at: new Date().toISOString() })
          .eq("id", p.id);

        if (upErr) {
          console.warn("[send-profile-reminders] mark sent", p.id, upErr.message);
        }
        sent++;
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        console.error("[send-profile-reminders] send", p.id, msg);
        errors.push(`${p.id}: ${msg.slice(0, 120)}`);
      }
    }

    return json({
      ok: true,
      window: { from: fromIso, to: toIso },
      scanned: (rows || []).length,
      candidates: candidates.length,
      sent,
      skipped,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    console.error("[send-profile-reminders]", e);
    return json({
      error: "server_error",
      message: String((e as Error)?.message || e),
    }, 500);
  }
});
