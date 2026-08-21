import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { randomUUID } from "crypto";
import { NEWSLETTER_MODULE } from "../../../../modules/newsletter";
import { sendMail } from "../../../../lib/send-mail";
import { smtpAusStore } from "../../../../lib/smtp-from-store";

const istEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function POST(req: MedusaRequest, res: MedusaResponse) 
{
  const { email, locale } = (req.body ?? {}) as { email?: string; locale?: string };

  if (!email || !istEmail(email)) 
{
    res.status(400).json({ message: "Ungültige E-Mail-Adresse" });
    return;
  }

  const service = req.scope.resolve(NEWSLETTER_MODULE) as any;
  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, any>) ?? {};

  const [vorhanden] = await service.listNewsletterSubscribers({ email }, { take: 1 });

  // Bereits bestätigt? Dann nichts tun – und trotzdem dieselbe Antwort geben,
  // damit über diese Route nicht herausgefunden werden kann, wer eingetragen ist.
  if (vorhanden?.status === "confirmed") 
{
    res.json({ ok: true });
    return;
  }

  const token = randomUUID();

  if (vorhanden) 
{
    await service.updateNewsletterSubscribers({
      id: vorhanden.id,
      token,
      status: "pending",
      locale: locale ?? "de",
    })
  } else {
    await service.createNewsletterSubscribers({
      email,
      token,
      locale: locale ?? "de",
      source: "storefront",
    })
  }

  const shopUrl = md.storefront_url || process.env.NEXT_PUBLIC_STOREFRONT_URL || "";
  const link = `${shopUrl}/newsletter/confirm?token=${token}`;

   const zugang = smtpAusStore(md)

  if (!zugang) 
{
    console.warn("[Newsletter] SMTP nicht konfiguriert – Bestätigungsmail übersprungen.");
  } else {
    try {
      await sendMail({
        ...zugang,
        to: email,
        subject: md.newsletter_confirm_subject || "Bitte bestätigen Sie Ihre Anmeldung",
        text: (
          md.newsletter_confirm_text ||
          "Bitte bestätigen Sie Ihre Anmeldung zum Newsletter über den folgenden Link:\n\n{link}\n\nWenn Sie sich nicht angemeldet haben, können Sie diese Nachricht ignorieren."
        ).replace("{link}", link),
      })
    } catch (e) 
    {
      console.error("[Newsletter] Bestätigungsmail fehlgeschlagen:", e);
    }
  }

  res.json({ ok: true });
}
