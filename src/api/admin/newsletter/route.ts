import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { NEWSLETTER_MODULE } from "../../../modules/newsletter";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(NEWSLETTER_MODULE) as any;

  const alle = await service.listNewsletterSubscribers({}, {
    order: { created_at: "DESC" },
    take: 500,
  })

  const zaehler = {
    confirmed: alle.filter((a: any) => a.status === "confirmed").length,
    pending: alle.filter((a: any) => a.status === "pending").length,
    unsubscribed: alle.filter((a: any) => a.status === "unsubscribed").length,
  }

  // Der Token gehört nicht in die Oberfläche – mit ihm ließe sich eine
  // fremde Anmeldung bestätigen oder abmelden.
  const eintraege = alle.map((a: any) => ({
    id: a.id,
    email: a.email,
    status: a.status,
    locale: a.locale,
    created_at: a.created_at,
    confirmed_at: a.confirmed_at,
  }))

  res.json({ subscribers: eintraege, zaehler })
}
