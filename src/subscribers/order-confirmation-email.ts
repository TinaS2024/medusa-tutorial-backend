import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";

import de from "../admin/locales/de.json";
import en from "../admin/locales/en.json";
import fr from "../admin/locales/fr.json";
import nl from "../admin/locales/nl.json";

type OrderPlacedEvent = { id: string };
type SupportedLocale = "de" | "en" | "fr" | "nl";

const templatesByLocale: Record<SupportedLocale, any> = { de, en, fr, nl };

const interpolate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));

const toSupportedLocale = (raw: unknown): SupportedLocale =>
  raw === "de" || raw === "en" || raw === "fr" || raw === "nl" ? raw : "de";

const isManualProvider = (id?: string) =>
  typeof id === "string" && id.startsWith("pp_system_default");

export default async function orderConfirmationEmailSubscriber({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) {

 console.log("[OrderMail] gefeuert für", data.id);

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const notificationModuleService = container.resolve(Modules.NOTIFICATION);
  const storeModuleService = container.resolve(Modules.STORE);

  const { data: [order] } = await query.graph({
    entity: "order",
    fields: [
      "id", "display_id", "email", "currency_code", "total",
      "customer.email",
      "items.*",
      "payment_collections.payments.provider_id",
    ],
    filters: { id: data.id },
  });

  const email = order?.email ?? order?.customer?.email;
  console.log("[OrderMail] order vorhanden?", !!order, "| email:", email);
  if (!email) return;


  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, any> | null) ?? {};

  const locale = toSupportedLocale(md.email_locale);
  const tpl = templatesByLocale[locale]?.email_templates?.order_confirmation;

  console.log("[OrderMail] locale:", locale, "| tpl?", !!tpl, "| email_locale:", md.email_locale);

  
  if (!tpl) return;

  const fromName =
    (typeof md.email_from_name === "string" && md.email_from_name) ||
    tpl.default_from_name || "";
  const fromEmail = typeof md.email_from === "string" ? md.email_from : null;

  const reference = String(order.display_id ?? order.id);
    const itemsText = (order.items ?? [])
    .map((it: any) => `- ${it.quantity ?? 1}x ${it.title}`)
    .join("\n");

  const totalText = `${Number(order.total ?? 0).toFixed(2)} ${String(order.currency_code ?? "").toUpperCase()}`;

  const usesPrepayment = (order.payment_collections ?? []).some((pc: any) =>
    (pc.payments ?? []).some((p: any) => isManualProvider(p.provider_id))
  );

  let paymentSection = "";
  if (usesPrepayment && md.bank_iban) {
    paymentSection = interpolate(tpl.prepayment_section || "", {
      total: totalText,
      reference,
      bank_account_holder: md.bank_account_holder ?? "",
      bank_name: md.bank_name ?? "",
      bank_iban: md.bank_iban ?? "",
      bank_bic: md.bank_bic ?? "",
      bank_note: md.bank_note ?? "",
    });
  }

  const subject = interpolate(tpl.subject || "Bestellbestätigung {reference}", { reference });
  const text = interpolate(tpl.text || "", {
    reference,
    items: itemsText,
    total: totalText,
    payment_section: paymentSection,
    from_name: fromName,
  });

  await notificationModuleService.createNotifications({
    to: email,
    channel: "email",
    template: "order-confirmation",
    data: { locale, subject, text, from_email: fromEmail, from_name: fromName },
  });
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
