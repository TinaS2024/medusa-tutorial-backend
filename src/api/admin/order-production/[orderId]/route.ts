import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ORDER_PRODUCTION_MODULE } from "../../../../modules/order-production";
import { PRODUCTION_STATUSES } from "../../../../modules/order-production/models/order-production";
import { sendMail, type MailAttachment } from "../../../../lib/send-mail";
import { getEmailTemplate } from "../../../../lib/email-templates";
import { createInvoice } from "../../../../lib/invoice/create-invoice";
import { readInvoicePdf } from "../../../../lib/invoice/invoice-storage";
import { INVOICE_MODULE } from "../../../../modules/invoice";
import { toLanguage } from "../../../../lib/invoice/build-invoice-data";

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

  // Rechnung erstellen, bevor die Status-Mail rausgeht – sie hängt daran.
  // Scheitert das, liefert der .catch() null und die Mail geht ohne Anhang.
  const newInvoice = await maybeCreateInvoice(req, orderId, status).catch(
    (e: any) => {
      console.warn("[Invoice] nicht erstellt:", e?.message);
      console.log("[Invoice] an die Mail übergeben:",newInvoice?.number ?? "nichts",newInvoice?.pdf_filename ?? "-");
      return null;
    }

  );

  await notifyCustomer(req, orderId, status, newInvoice).catch((e: any) =>
    console.warn("[OrderProduction] Mail-Fehler:", e?.message)
  );


  res.json({ status, note: production.note ?? null });
}

/**
 * Erstellt die Rechnung, wenn der eingestellte Auslöser-Status erreicht ist.
 *
 * Passiert nur, wenn im Admin unter "Rechnungen" eingestellt ist, dass
 * Medusa die Rechnungen erstellt. Steht dort "GPE" oder "Keine", tut diese
 * Funktion nichts – das ist der Umschalter aus der Planung.
 *
 * Ein Fehler hier darf das Speichern des Status nicht verhindern. Deshalb
 * wird der Aufruf oben mit .catch() abgefangen: Der Status wird gesetzt,
 * die Rechnung fehlt, und der Admin kann sie am Widget von Hand nachholen.
 */
async function maybeCreateInvoice(
  req: MedusaRequest,
  orderId: string,
  status: string
): Promise<any | null> {
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, any> | null) ?? {};

  if (md.invoice_source !== "medusa") return null;

  const trigger =
    typeof md.invoice_trigger_status === "string"
      ? md.invoice_trigger_status
      : "ready_to_ship";

  if (status !== trigger) return null;

  const { invoice, created } = await createInvoice({
    container: req.scope,
    orderId,
  });

  console.log(
    created
      ? `[Invoice] ${invoice.number} für Bestellung ${orderId} erstellt.`
      : `[Invoice] ${invoice.number} existierte bereits.`
  );

  // Die Rechnung wird zurückgegeben, egal ob sie gerade entstanden ist
  // oder schon existierte. Sonst bekäme ein Kunde nie eine Rechnung per
  // Mail, wenn sie vorher über den Knopf im Admin erstellt wurde.

  return invoice;
}


async function notifyCustomer(
  req: MedusaRequest,
  orderId: string,
  status: string,
  invoice: any | null
) {

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const storeModuleService = req.scope.resolve(Modules.STORE);

  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "locale", "customer.email"],
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
  
  // Das Feld `locale` gibt es zur Laufzeit – das Übersetzungs-Modul legt
  // es an, und complete-cart schreibt es aus dem Warenkorb in die
  // Bestellung. Nur die Typen von query.graph kennen es noch nicht,
  // deshalb die ausdrückliche Angabe. Dieselbe Stelle gibt es im
  // Storefront in lib/data/cart.ts.
  const orderLocale = (order as { locale?: string })?.locale;

  const locale = toLanguage(orderLocale ?? md.email_locale);


  const tpl = getEmailTemplate(store?.metadata, locale, "production_status_update");
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
  
  // Die Rechnung anhängen, falls eine mitgegeben wurde. Ein fehlendes
  // oder unlesbares PDF darf die Mail nicht verhindern – der Kunde soll
  // die Statusmeldung in jedem Fall bekommen.
  const attachments: MailAttachment[] = [];

  // Nur anhängen, wenn die Rechnung noch nie verschickt wurde.
  if (invoice?.pdf_filename && !invoice.mailed_at) {

    try {
      const content = await readInvoicePdf(invoice.pdf_filename);
      attachments.push({
        filename: invoice.pdf_filename,
        content,
        contentType: "application/pdf",
      });
    } catch (e: any) {
      console.warn(
        `[Invoice] Anhang ${invoice.pdf_filename} nicht lesbar: ${e?.message}`
      );
    }
  }

  // Hinweis auf den Anhang. Über die Vorlage im Admin überschreibbar,
  // die anderen Sprachen kommen in Etappe 7 dazu.
  const invoiceNote = attachments.length
    ? (typeof tpl.invoice_note === "string" && tpl.invoice_note) ||
      "Ihre Rechnung finden Sie im Anhang dieser E-Mail."
    : "";

  const text =
    interpolate(tpl.text || "{status_label}", {
      reference,
      status_label: statusLabel,
      from_name: fromName,
    }) + (invoiceNote ? `\n\n${invoiceNote}` : "");

    console.log(`[OrderProduction] Mail an ${email} (${status})` + (attachments.length ? ` mit Anhang ${attachments[0].filename}`  : " ohne Anhang"));



  await sendMail({
    smtp: { host: smtpHost, port: smtpPort, secure: smtpPort === 465, user: smtpUser, pass: smtpPass },
    from,
    to: email,
    subject,
    text,
    attachments,
  });

  
  // Erst nach erfolgreichem Versand vermerken. Schlägt sendMail fehl,
  // bleibt mailed_at leer und der nächste Versuch hängt sie wieder an –
  // der Kunde geht also nicht leer aus.
  if (attachments.length) 
  {
    const invoiceService: any = req.scope.resolve(INVOICE_MODULE);
    await invoiceService.updateInvoices({ id: invoice.id, mailed_at: new Date() });
  }

}
