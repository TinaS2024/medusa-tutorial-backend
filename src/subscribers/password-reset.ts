import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { sendMail } from "../lib/send-mail";

import de from "../admin/locales/de.json";
import en from "../admin/locales/en.json";
import fr from "../admin/locales/fr.json";
import nl from "../admin/locales/nl.json";

type PasswordResetEvent = {
  entity_id: string
  token: string
  actor_type: string
}

type SupportedLocale = "de" | "en" | "fr" | "nl"

const templatesByLocale: Record<SupportedLocale, any> = {
  de,
  en,
  fr,
  nl,
}

const interpolate = (template: string, vars: Record<string, string>) => {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match
  })
}

const toSupportedLocale = (raw: unknown): SupportedLocale => {
  if (raw === "de" || raw === "en" || raw === "fr" || raw === "nl") {
    return raw
  }

  return "de";
}


export default async function passwordResetSubscriber({event: { data },container}: SubscriberArgs<PasswordResetEvent>) {


  const storeModuleService = container.resolve(Modules.STORE);

  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const metadata = (store?.metadata as Record<string, unknown> | null) ?? null;

  const storefrontUrl = (typeof metadata?.storefront_url === "string" && metadata.storefront_url) ||
    process.env.STOREFRONT_URL ||
    "http://localhost:8000";

   const fromEmail = typeof metadata?.email_from === "string" ? metadata.email_from : null;
  const fromName = typeof metadata?.email_from_name === "string" ? metadata.email_from_name : null;

  // SMTP-Zugangsdaten aus den Store-Metadaten (im Admin einstellbar)
  const smtpHost = typeof metadata?.smtp_host === "string" ? metadata.smtp_host : null;
  const smtpUser = typeof metadata?.smtp_user === "string" ? metadata.smtp_user : null;
  const smtpPass = typeof metadata?.smtp_pass === "string" ? metadata.smtp_pass : null;
  const smtpPort = Number(metadata?.smtp_port) || 587;
  const smtpSecure = smtpPort === 465;

  const locale = toSupportedLocale(metadata?.email_locale);
  const tpl = templatesByLocale[locale]?.email_templates?.password_reset;

  const email = data.entity_id;
  const token = data.token;

  const signatureName = fromName || (tpl?.default_from_name as string | undefined) || "";

  // Link zeigt jetzt auf die eigene Reset-Seite (ohne /account, siehe Teil C)
  const resetUrl = `${storefrontUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  const subject = (tpl?.subject as string | undefined) || "Password reset";
  const text = interpolate(
    (tpl?.text as string | undefined) || "Link: {reset_url}",
    {
      email,
      code: token,
      reset_url: resetUrl,
      from_name: signatureName,
    }
  )

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[PasswordReset] SMTP nicht konfiguriert – es wurde keine E-Mail versendet.");
    return;
  }

  const from = fromName
    ? `${fromName} <${fromEmail ?? smtpUser}>`
    : (fromEmail ?? smtpUser);

  await sendMail({
    smtp: { host: smtpHost, port: smtpPort, secure: smtpSecure, user: smtpUser, pass: smtpPass },
    from,
    to: email,
    subject,
    text,
  });
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}