import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ORDER_PRODUCTION_MODULE } from "../../../../modules/order-production";
import { PRODUCTION_STATUSES } from "../../../../modules/order-production/models/order-production";
import { sendMail } from "../../../../lib/send-mail";

import de from "../../../../admin/locales/de.json";
import en from "../../../../admin/locales/en.json";
import fr from "../../../../admin/locales/fr.json";
import nl from "../../../../admin/locales/nl.json";

const templatesByLocale: Record<string, any> = { de, en, fr, nl };
const interpolate = (t: string, v: Record<string, string>) =>
  t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m));

export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const { orderId } = req.params;
  const service: any = req.scope.resolve(ORDER_PRODUCTION_MODULE);
  const [p] = await service.listOrderProductions({ order_id: orderId }, { take: 1 });
  res.json({ status: p?.status ?? "received", note: p?.note ?? null });
}

export async function POST(req: MedusaRequest, res: MedusaResponse) 
{
  const { orderId } = req.params;
  const body = (req.body ?? {}) as { status?: string; note?: string };
  const status = body.status;

  if (!status || !PRODUCTION_STATUSES.includes(status as any)) 
{
    res.status(400).json({ message: "Ungültiger Status" });
    return;
  }

  const service: any = req.scope.resolve(ORDER_PRODUCTION_MODULE);
  const [existing] = await service.listOrderProductions({ order_id: orderId }, { take: 1 });

  let production: any;
  if (existing) {
    production = await service.updateOrderProductions({
      id: existing.id,
      status,
      note: body.note ?? existing.note,
    });
  } else {
    production = await service.createOrderProductions({
      order_id: orderId,
      status,
      note: body.note ?? null,
    });
  }

  await service.createOrderProductionEvents({ production_id: production.id, status });

  await notifyCustomer(req, orderId, status).catch((e: any) =>
    console.warn("[OrderProduction] Mail-Fehler:", e?.message)
  );

  res.json({ status, note: production.note ?? null });
}

async function notifyCustomer(req: MedusaRequest, orderId: string, status: string) 
{
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const storeModuleService = req.scope.resolve(Modules.STORE);

  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "customer.email"],
    filters: { id: orderId },
  });
  const email = order?.email ?? order?.customer?.email;
  if (!email) return;

  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, any> | null) ?? {};

  const smtpHost = typeof md.smtp_host === "string" ? md.smtp_host : null;
  const smtpUser = typeof md.smtp_user === "string" ? md.smtp_user : null;
  const smtpPass = typeof md.smtp_pass === "string" ? md.smtp_pass : null;
  const smtpPort = Number(md.smtp_port) || 587;
  if (!smtpHost || !smtpUser || !smtpPass) 
{
    console.warn("[OrderProduction] SMTP nicht konfiguriert – keine Mail.");
    return;
  }

  const locale = ["de", "en", "fr", "nl"].includes(md.email_locale) ? md.email_locale : "de";
  const tpl = templatesByLocale[locale]?.email_templates?.production_status_update;
  if (!tpl) return;

  const fromName = (typeof md.email_from_name === "string" && md.email_from_name) || tpl.default_from_name || "";
  const fromEmail = typeof md.email_from === "string" ? md.email_from : null;
  const from = fromName ? `${fromName} <${fromEmail ?? smtpUser}>` : (fromEmail ?? smtpUser);

  const reference = String(order.display_id ?? order.id);
  const statusLabel = tpl.statuses?.[status] ?? status;

  const subject = interpolate(tpl.subject || "Status {reference}", {
    reference,
    status_label: statusLabel,
  });
  const text = interpolate(tpl.text || "{status_label}", {
    reference,
    status_label: statusLabel,
    from_name: fromName,
  });

  await sendMail({
    smtp: { host: smtpHost, port: smtpPort, secure: smtpPort === 465, user: smtpUser, pass: smtpPass },
    from,
    to: email,
    subject,
    text,
  });
}
