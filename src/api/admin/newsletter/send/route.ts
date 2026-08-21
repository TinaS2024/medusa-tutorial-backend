import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { NEWSLETTER_MODULE } from "../../../../modules/newsletter";
import { sendMail } from "../../../../lib/send-mail";
import { smtpAusStore } from "../../../../lib/smtp-from-store";

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { subject, text, testTo } = (req.body ?? {}) as {
    subject?: string
    text?: string
    testTo?: string
  }

  if (!subject?.trim() || !text?.trim()) 
{
    res.status(400).json({ message: "Betreff und Text dürfen nicht leer sein." })
    return;
  }

  const storeModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const md = (store?.metadata as Record<string, any>) ?? {};

  const zugang = smtpAusStore(md);

  if (!zugang) 
{
    res.status(400).json({ message: "Es ist kein Postausgang eingerichtet." });
    return;
  }

  const shopUrl = md.storefront_url || process.env.NEXT_PUBLIC_STOREFRONT_URL || "";

  // Testnachricht: geht nur an die angegebene Adresse, ohne die Liste anzurühren.
  if (testTo) 
  {
    await sendMail({
      ...zugang,
      to: testTo,
      subject: `[Test] ${subject}`,
      text: `${text}\n\n---\nAbmelden: ${shopUrl}/newsletter/unsubscribe?token=BEISPIEL`,
    })

    res.json({ test: true, gesendet: 1, fehlgeschlagen: 0 });
    return;
  }

  const service = req.scope.resolve(NEWSLETTER_MODULE) as any;
  const empfaenger = await service.listNewsletterSubscribers(
    { status: "confirmed" },
    { take: 1000 }
  )

  let gesendet = 0
  let fehlgeschlagen = 0

  for (const e of empfaenger) {
    // Der Abmeldelink wird angehängt, nicht dem Text überlassen: Ohne ihn
    // wäre der Versand unzulässig, und ein Betreiber könnte ihn versehentlich
    // aus der Vorlage löschen.
    const abmelden = `${shopUrl}/newsletter/unsubscribe?token=${e.token}`

    try {
      await sendMail({
        ...zugang,
        to: e.email,
        subject,
        text: `${text}\n\n---\nSie erhalten diese Nachricht, weil Sie sich für unseren Newsletter angemeldet haben.\nAbmelden: ${abmelden}`,
      })
      gesendet++
    } catch (err) {
      console.error(`[Newsletter] Versand an ${e.email} fehlgeschlagen:`, err)
      fehlgeschlagen++
    }

    // Kleine Pause, damit der Postausgang den Versand nicht als Massenmail wertet
    await warte(250)
  }

  res.json({ gesendet, fehlgeschlagen, empfaenger: empfaenger.length })
}
