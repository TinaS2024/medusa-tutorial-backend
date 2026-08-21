import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { NEWSLETTER_MODULE } from "../../../../modules/newsletter";

export async function GET(req: MedusaRequest, res: MedusaResponse) 
{
  const token = String(req.query.token ?? "");
  if (!token) 
{
    res.status(400).json({ ok: false });
    return;
  }

  const service = req.scope.resolve(NEWSLETTER_MODULE) as any;
  const [eintrag] = await service.listNewsletterSubscribers({ token }, { take: 1 })

  if (!eintrag) 
{
    res.status(404).json({ ok: false });
    return;
  }

   await service.updateNewsletterSubscribers({
    id: eintrag.id,
    status: "unsubscribed",
  })

  res.json({ ok: true });
}
