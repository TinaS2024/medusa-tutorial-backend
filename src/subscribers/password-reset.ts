import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";

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
  const notificationModuleService = container.resolve(Modules.NOTIFICATION);

  const storeModuleService = container.resolve(Modules.STORE);

  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const metadata = (store?.metadata as Record<string, unknown> | null) ?? null;

  const storefrontUrl = (typeof metadata?.storefront_url === "string" && metadata.storefront_url) ||
    process.env.STOREFRONT_URL ||
    "http://localhost:8000";

  const fromEmail = typeof metadata?.email_from === "string" ? metadata.email_from : null;

  const fromName = typeof metadata?.email_from_name === "string" ? metadata.email_from_name : null;

  const locale = toSupportedLocale(metadata?.email_locale);
  const tpl = templatesByLocale[locale]?.email_templates?.password_reset;

  const email = data.entity_id;
  const token = data.token;

  const signatureName = fromName || (tpl?.default_from_name as string | undefined) || "";

  const subject = (tpl?.subject as string | undefined) || "Password reset";
  const text = interpolate(
    (tpl?.text as string | undefined) || "Code: {code}",
    {
      email,
      code: token,
      from_name: signatureName,
    }
  )

  const resetUrl = `${storefrontUrl}/account/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  await notificationModuleService.createNotifications({
    to: email,
    channel: "email",
    template: "password-reset",
    data: {
      locale,
      subject,
      text,
      code: token,
      reset_url: resetUrl,
      from_email: fromEmail,
      from_name: fromName,
    },
  })
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}