import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";

import { INVOICE_MODULE } from "../../modules/invoice";
import { readInvoicePdf } from "./invoice-storage";
import { sendMail, type MailAttachment } from "../send-mail";
import { smtpAusStore } from "../smtp-from-store";
import { INVOICE_MAIL_TEXTS } from "./texts";

const interpolate = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? values[key] : match
  );

/**
 * Verschickt ein Rechnungsdokument als PDF-Anhang an den Kunden.
 *
 * Wirft nie. Der Aufrufer soll nicht scheitern, nur weil eine Mail nicht
 * rausging – ein Storno bleibt schließlich gültig, auch wenn der Kunde
 * die Mail nicht bekommen hat. Was passiert ist, steht im Rückgabewert.
 *
 * `force` übergeht die Sperre gegen Doppelversand – das braucht der
 * Knopf "Erneut senden", wenn ein Kunde sein Dokument verloren hat.
 */
export async function sendInvoiceMail(args: {
  container: MedusaContainer;
  invoiceId: string;
  force?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  const { container, invoiceId, force = false } = args;

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const storeModuleService = container.resolve(Modules.STORE);
    const invoiceService: any = container.resolve(INVOICE_MODULE);

    const [invoice] = await invoiceService.listInvoices({ id: invoiceId }, { take: 1 });

    if (!invoice) {
      return { sent: false, reason: "Dokument nicht gefunden" };
    }

    if (!invoice.pdf_filename) {
      return { sent: false, reason: "Zu diesem Dokument gibt es keine Datei" };
    }

    if (invoice.mailed_at && !force) {
      return { sent: false, reason: "Wurde bereits verschickt" };
    }

    const { data: [order] } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "email", "customer.email"],
      filters: { id: invoice.order_id },
    });

    const email = order?.email ?? order?.customer?.email;

    if (!email) {
      return { sent: false, reason: "Keine E-Mail-Adresse zur Bestellung" };
    }

    const [store] = await storeModuleService.listStores({}, { take: 1 });
    const md = (store?.metadata as Record<string, any> | null) ?? {};

    const access = smtpAusStore(md);

    if (!access) {
      return { sent: false, reason: "Postausgang nicht eingerichtet" };
    }

    // Bei Korrekturen: die Nummer der Rechnung, auf die sie sich bezieht.
    let correctsNumber = "";

    if (invoice.corrects_invoice_id) {
      const [original] = await invoiceService.listInvoices(
        { id: invoice.corrects_invoice_id },
        { take: 1 }
      );
      correctsNumber = original?.number ?? "";
    }

    // invoice.locale trägt schon das reine Sprachkürzel (de/en/fr/nl),
    // gesetzt beim Erstellen aus data.language.
    const mailTexts = INVOICE_MAIL_TEXTS[invoice.locale] ?? INVOICE_MAIL_TEXTS.en;
    const texts = mailTexts[invoice.type] ?? mailTexts.invoice;


    const values = {
      number: invoice.number,
      reference: String(order.display_id ?? ""),
      corrects: correctsNumber,
    };

    const signature =
      typeof md.email_from_name === "string" && md.email_from_name
        ? `${mailTexts.closing}\n${md.email_from_name}`
        : mailTexts.closing;

    const subject = interpolate(texts.subject, values);
    const text = `${mailTexts.greeting}\n\n${interpolate(texts.intro, values)}\n\n${signature}`;

    const content = await readInvoicePdf(invoice.pdf_filename);

    const attachments: MailAttachment[] = [
      { filename: invoice.pdf_filename, content, contentType: "application/pdf" },
    ];

    await sendMail({
      smtp: access.smtp,
      from: access.from,
      to: email,
      subject,
      text,
      attachments,
    });

    await invoiceService.updateInvoices({ id: invoice.id, mailed_at: new Date() });

    logger.info(`[invoice] ${invoice.number} an ${email} verschickt.`);

    return { sent: true };
  } catch (e: any) {
    logger.error(`[invoice] Versand fehlgeschlagen: ${e?.message}`);
    return { sent: false, reason: e?.message ?? "Unbekannter Fehler" };
  }
}
