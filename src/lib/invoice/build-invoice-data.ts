/** Die vier Sprachen, für die es Rechnungstexte gibt. */
export type SupportedLanguage = "de" | "en" | "fr" | "nl";


/** Ein Steuersatz mit den Summen, die darauf entfallen. */
export type InvoiceTaxGroup = {
  rate: number;
  net: number;
  tax: number;
};

/** Eine Zeile auf der Rechnung. Versandkosten sind auch so eine Zeile. */
export type InvoiceLine = {
  position: number;
  title: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  net: number;
  tax_rate: number;
  tax: number;
  gross: number;
};

export type InvoiceSeller = {
  country: string;
  company: string | null;
  address: string | null;
  vat_id: string | null;
  tax_number: string | null;
  register: string | null;
  email: string | null;
  phone: string | null;
};

export type InvoiceBuyer = {
  name: string;
  company: string | null;
  address_lines: string[];
  email: string | null;
  vat_id: string | null;
};

export type InvoiceBank = {
  account_holder: string | null;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
};

export type InvoiceData = {
  order_id: string;
  order_reference: string;
  order_date: Date;
  locale: string;
  language: SupportedLanguage;
  currency_code: string;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  lines: InvoiceLine[];
  shipping: InvoiceLine | null;
  tax_groups: InvoiceTaxGroup[];
  total_net: number;
  total_tax: number;
  total_gross: number;
  payment_terms_days: number;
  footer_note: string | null;
  bank: InvoiceBank;
};

/** Auf zwei Nachkommastellen runden – Geldbeträge haben nie mehr. */
export const round2 = (value: number) => Math.round(value * 100) / 100;

/** Medusa liefert Beträge je nach Weg als Zahl oder Text. */
const toAmount = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const toTextOrNull = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Der Steuersatz einer Zeile in Prozent.
 *
 * Medusa erlaubt mehrere Steuerzeilen pro Position – in Ländern wie den USA
 * kommen Bundes- und Regionalsteuer zusammen. Bei uns ist es immer genau
 * eine. Falls doch mehrere auftauchen, werden die Sätze addiert.
 */
const taxRateOf = (taxLines: any[] | undefined): number =>
  round2((taxLines ?? []).reduce((sum, tl) => sum + toAmount(tl.rate), 0));

/** Die Anschrift des Kunden als einzelne Zeilen. */
const addressLines = (address: any): string[] => {
  if (!address) return [];
  return [
    toTextOrNull(address.address_1),
    toTextOrNull(address.address_2),
    [toTextOrNull(address.postal_code), toTextOrNull(address.city)]
      .filter(Boolean)
      .join(" ") || null,
    toTextOrNull(address.province),
    toTextOrNull(address.country_code)?.toUpperCase() ?? null,
  ].filter((z): z is string => Boolean(z));
};

/**
 * Aus einem Gebietsschema wie "de-DE" die Sprache "de" machen.
 *
 * Wir brauchen beides: "de-DE" für Datums- und Geldformate (daraus wird
 * 16.09.2026 statt 9/16/2026), und "de" für die Auswahl der Textbausteine.
 */
export const toLanguage = (raw: unknown): SupportedLanguage => {
  const value = typeof raw === "string" ? raw.toLowerCase() : "";
  if (value.startsWith("en")) return "en";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("nl")) return "nl";
  return "de";
};

/**
 * Die Variantenbezeichnung – aber nur, wenn sie etwas Neues sagt.
 *
 * Hat eine Variante keinen eigenen Namen, trägt sie in Medusa denselben
 * Text wie das Produkt. Der stünde dann zweimal untereinander auf der
 * Rechnung, einmal als Bezeichnung und einmal als Zusatz.
 */
const variantSubtitle = (item: any): string | null => {
  const title = toTextOrNull(item.product_title ?? item.title);
  const variant = toTextOrNull(item.variant_title);
  return variant && variant !== title ? variant : null;
};


/**
 * Baut aus einer Bestellung alles zusammen, was auf der Rechnung steht.
 *
 * Diese Funktion rechnet NICHT selbst Steuern aus. Sie liest die Beträge,
 * die in der Bestellung stehen – also genau das, was der Kunde bezahlt hat.
 * Würde sie selbst rechnen, könnten Zahlung und Rechnung auseinanderlaufen,
 * und das wäre ein echter Fehler, kein Schönheitsfehler.
 *
 * Achtung: Die Funktion setzt Nettopreise voraus (is_tax_inclusive = false),
 * so wie euer Shop eingestellt ist. Bruttopreise kommen in Etappe 7 dazu.
 */
export function buildInvoiceData(args: {
  order: any;
  storeMetadata: Record<string, any> | null | undefined;
}): InvoiceData {
  const { order } = args;
  const md = args.storeMetadata ?? {};

  const lines: InvoiceLine[] = (order.items ?? []).map((item: any, index: number) => {
    // subtotal = Menge x Einzelpreis, ohne Steuer und vor Rabatt.
    const net = round2(toAmount(item.subtotal) - toAmount(item.discount_total));
    const tax = round2(toAmount(item.tax_total));

    return {
      position: index + 1,
      title: item.product_title ?? item.title ?? "",
      description: variantSubtitle(item),
      quantity: toAmount(item.quantity),
      unit_price: round2(toAmount(item.unit_price)),
      net,
      tax_rate: taxRateOf(item.tax_lines),
      tax,
      gross: round2(net + tax),
    };
  });

  // Versandkosten sind steuerpflichtig und müssen auf der Rechnung stehen.
  // Die Beträge kommen von der Bestellung, nicht von der Versandart – die
  // Versandart kennt nur ihren Grundbetrag, nicht Rabatt und Steuer.
  const method = (order.shipping_methods ?? [])[0];
  const shippingNet = round2(
    toAmount(order.shipping_subtotal) - toAmount(order.shipping_discount_total)
  );
  const shippingTax = round2(toAmount(order.shipping_tax_total));

  const shipping: InvoiceLine | null = method
    ? {
        position: lines.length + 1,
        title: toTextOrNull(method.name) ?? "Versand",
        description: null,
        quantity: 1,
        unit_price: shippingNet,
        net: shippingNet,
        tax_rate: taxRateOf(method.tax_lines),
        tax: shippingTax,
        gross: round2(shippingNet + shippingTax),
      }
    : null;

  const allLines = shipping ? [...lines, shipping] : lines;

  // Steuer je Satz ausweisen ist Pflicht. Wir summieren dabei die Beträge
  // der Zeilen, statt den Satz auf die Summe anzuwenden – nur so ergibt die
  // Aufstellung am Ende exakt den Betrag, den der Kunde bezahlt hat.
  const groups = new Map<number, InvoiceTaxGroup>();

  for (const line of allLines) {
    const group = groups.get(line.tax_rate) ?? { rate: line.tax_rate, net: 0, tax: 0 };
    group.net = round2(group.net + line.net);
    group.tax = round2(group.tax + line.tax);
    groups.set(line.tax_rate, group);
  }

  const tax_groups = [...groups.values()].sort((a, b) => a.rate - b.rate);

  const total_net = round2(allLines.reduce((s, l) => s + l.net, 0));
  const total_tax = round2(allLines.reduce((s, l) => s + l.tax, 0));

  const billing = order.billing_address ?? order.shipping_address ?? null;

  return {
    order_id: order.id,
    order_reference: String(order.display_id ?? order.id),
    order_date: new Date(order.created_at),
    locale: toTextOrNull(order.locale) ?? "de-DE",
    language: toLanguage(order.locale),
    currency_code: String(order.currency_code ?? "eur").toUpperCase(),


    seller: {
      country: toTextOrNull(md.invoice_seller_country) ?? "de",
      company: toTextOrNull(md.imprint_company),
      address: toTextOrNull(md.imprint_address),
      vat_id: toTextOrNull(md.imprint_vat_id),
      tax_number: toTextOrNull(md.invoice_tax_number),
      register: toTextOrNull(md.imprint_register),
      email: toTextOrNull(md.imprint_email),
      phone: toTextOrNull(md.imprint_phone),
    },

    buyer: {
      name: [toTextOrNull(billing?.first_name), toTextOrNull(billing?.last_name)]
        .filter(Boolean)
        .join(" "),
      company: toTextOrNull(billing?.company),
      address_lines: addressLines(billing),
      email: toTextOrNull(order.email),
      // Platzhalter für B2B – wird in Etappe 9 gefüllt.
      vat_id: null,
    },

    lines,
    shipping,
    tax_groups,
    total_net,
    total_tax,
    total_gross: round2(total_net + total_tax),

    payment_terms_days: Number(md.invoice_payment_terms_days ?? 14),
    footer_note: toTextOrNull(md.invoice_footer_note),

    bank: {
      account_holder: toTextOrNull(md.bank_account_holder),
      bank_name: toTextOrNull(md.bank_name),
      iban: toTextOrNull(md.bank_iban),
      bic: toTextOrNull(md.bank_bic),
    },
  };
}

/**
 * Dreht alle Beträge ins Negative – die Grundlage jeder Korrektur.
 *
 * Die Mengen bleiben positiv: Auf der Stornorechnung steht weiterhin
 * "1 x Alu-Schilder", nur mit -21,00 €. Das ist die übliche Darstellung
 * und leichter zu lesen als eine Menge von -1.
 */
export function negateInvoiceData(data: InvoiceData): InvoiceData {
  const negateLine = (line: InvoiceLine): InvoiceLine => ({
    ...line,
    unit_price: -line.unit_price,
    net: -line.net,
    tax: -line.tax,
    gross: -line.gross,
  });

  return {
    ...data,
    lines: data.lines.map(negateLine),
    shipping: data.shipping ? negateLine(data.shipping) : null,
    tax_groups: data.tax_groups.map((g) => ({ ...g, net: -g.net, tax: -g.tax })),
    total_net: -data.total_net,
    total_tax: -data.total_tax,
    total_gross: -data.total_gross,
  };
}
