import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ERP_MODULE } from "../modules/erp";
import type ErpModuleService from "../modules/erp/service";

type OrderPlacedEvent = { id: string }

/**
 * Freitext robust normalisieren: klein, getrimmt, Umlaute → ae/oe/ue/ss und
 * alle Trenner (Leerzeichen, Bindestrich, Unterstrich, Punkt) entfernen. So
 * kollabieren "Baden-Württemberg", "Baden Württemberg", "baden wuerttemberg"
 * auf denselben Schlüssel.
 */
function normalizeProvince(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\s\-_.]+/g, "")
}

/** Normalisierter voller Name → GPE-Code (Schlüssel schon normalisiert). */
const DE_PROVINCE_TO_CODE: Record<string, string> = {
  badenwuerttemberg: "BW",
  bayern: "BY",
  berlin: "BE",
  brandenburg: "BB",
  bremen: "HB",
  hamburg: "HH",
  hessen: "HE",
  mecklenburgvorpommern: "MV",
  niedersachsen: "NI",
  nordrheinwestfalen: "NW",
  rheinlandpfalz: "RP",
  saarland: "SL",
  sachsen: "SN",
  sachsenanhalt: "ST",
  schleswigholstein: "SH",
  thueringen: "TH",
}

/** Gängige Abkürzungen (ebenfalls normalisiert). */
const DE_PROVINCE_ALIASES: Record<string, string> = {
  nrw: "NW",
  bawue: "BW",
}

const GPE_STATE_CODES = new Set(Object.values(DE_PROVINCE_TO_CODE))

/** Medusa-Bundesland (Freitext) → GPE-Optionswert (ISO-Code). undefined = nicht senden. */
function toGpeState(province: unknown, countryCode: unknown): string | undefined {
  const raw = typeof province === "string" ? province.trim() : ""
  if (!raw) return undefined
  const country = typeof countryCode === "string" ? countryCode.toUpperCase() : ""
  if (country && country !== "DE") return undefined // aktuell nur Deutschland gemappt
  // Schon ein gültiger Code (z. B. "BY")? Direkt durchreichen.
  if (GPE_STATE_CODES.has(raw.toUpperCase())) return raw.toUpperCase()
  const key = normalizeProvince(raw)
  return DE_PROVINCE_TO_CODE[key] ?? DE_PROVINCE_ALIASES[key] // undefined bei unbekannt
}

/**
 * Bei Bestellung: Liefer-Adresse + Kontakt an den verknüpften GPE-Kunden
 * anhängen (nicht überschreiben). Läuft NUR, wenn der Medusa-Kunde über
 * customer.metadata.gpe_id mit einem GPE-Kunden verknüpft ist (Weg 1).
 *
 * Bewusst fehlertolerant: GPE-Probleme dürfen den Bestellabschluss nicht
 * stören – sie werden geloggt, nicht geworfen. Getrennt vom Outbox-Manifest
 * (order-placed-gpe.ts), damit beide unabhängig laufen.
 */
export default async function orderPlacedGpeCustomerSubscriber({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) 
{
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const erp: ErpModuleService = container.resolve(ERP_MODULE);

  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "customer.id",
      "customer.metadata",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.address_1",
      "shipping_address.address_2",
      "shipping_address.postal_code",
      "shipping_address.city",
      "shipping_address.province",
      "shipping_address.country_code",
    ],
    filters: { id: data.id },
  })

  if (!order) 
{
    logger.error(`[GPE-Kunde] Bestellung ${data.id} nicht gefunden.`)
    return;
  }

  // Nur bei verknüpftem Kunden (Weg 1). Sonst nichts tun.
  const gpeIdRaw = (order.customer?.metadata as any)?.gpe_id;
  if (
    gpeIdRaw == null ||
    (typeof gpeIdRaw !== "string" && typeof gpeIdRaw !== "number") || String(gpeIdRaw).trim() === "") 
    {
    logger.info(
      `[GPE-Kunde] Bestellung ${order.display_id}: Kunde nicht mit GPE verknüpft (keine gpe_id), übersprungen.`
    )
    return
  }
  const gpeCustomerId = String(gpeIdRaw).trim();

  const addr = order.shipping_address as any;
  if (!addr?.first_name || !addr?.last_name) 
    {
    logger.warn( `[GPE-Kunde] Bestellung ${order.display_id}: Lieferadresse ohne Vor-/Nachname, übersprungen.` );
    return;
  }

  const address = {
    firstName: addr.first_name,
    lastName: addr.last_name,
    line1: addr.address_1 ?? undefined,
    line2: addr.address_2 ?? undefined,
    postalCode: addr.postal_code ?? undefined,
    city: addr.city ?? undefined,
    state: toGpeState(addr.province, addr.country_code),
    country: addr.country_code ? String(addr.country_code).toUpperCase() : undefined,
    email: order.email ?? undefined,
  }

  try {
    const contact = await erp.addContactToCustomerIfNotExists({ gpeCustomerId, address });
    const savedAddress = await erp.addAddressToCustomerIfNotExists({ gpeCustomerId, address });
    logger.info(
      `[GPE-Kunde] Bestellung ${order.display_id} → GPE-Kunde ${gpeCustomerId}: ` +
        `Kontakt ${(contact as any)?.number ?? "?"}, Adresse ${(savedAddress as any)?.number ?? "?"} angehängt.`
    )
  } catch (err: any) 
  {
    logger.error( `[GPE-Kunde] Bestellung ${order.display_id}: Anhängen an GPE-Kunde ${gpeCustomerId} fehlgeschlagen: ${err?.message ?? err}` );
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
