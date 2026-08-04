/**
 * Meldet dem Storefront, dass sich Daten geändert haben, damit es den
 * betroffenen Cache invalidiert. Fehlertolerant: fehlende Env-Variablen oder
 * ein nicht erreichbares Storefront führen nie zu einem Fehler beim Speichern.
 */
export async function revalidateStorefront(
  tags: string[]
): Promise<{ ok: boolean; reason?: string }> 
{
  const url = process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_STOREFRONT_URL
  const secret = process.env.REVALIDATE_SECRET || process.env.NEXT_PUBLIC_REVALIDATE_SECRET

  if (!url || !secret) {
    return { ok: false, reason: "STOREFRONT_URL oder REVALIDATE_SECRET fehlt" }
  }

  try {
    const res = await fetch(`${url}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tags }),
    })
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` }
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? String(err) }
  }
}
