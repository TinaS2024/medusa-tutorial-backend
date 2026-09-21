import type { SupportedLanguage } from "./build-invoice-data";

/**
 * Alle Beschriftungen auf einem Rechnungsdokument.
 *
 * Als TypeScript-Typ und nicht als JSON: Fehlt in einer Sprache ein
 * Schlüssel, meckert der Editor sofort. In einer JSON-Datei würde es erst
 * auffallen, wenn "undefined" auf einer Kundenrechnung steht.
 */
export type InvoiceTexts = {
  invoice: string;
  cancellation: string;
  credit_note: string;
  billing_to: string;
  invoice_no: string;
  invoice_date: string;
  document_no: string;
  document_date: string;
  service_date: string;
  order_no: string;
  pos: string;
  description: string;
  quantity: string;
  unit_price: string;
  net: string;
  vat: string;
  vat_on: string;
  vat_at: string;
  gross: string;
  total_net: string;
  total_gross: string;
  payment_terms: string;
  bank_details: string;
  cancels: string;
  refers_to: string;
  from_date: string;
  refund_note: string;
};

export const INVOICE_TEXTS: Record<SupportedLanguage, InvoiceTexts> = {
  de: {
    invoice: "Rechnung",
    cancellation: "Stornorechnung",
    credit_note: "Rechnungskorrektur",
    billing_to: "Rechnungsanschrift",
    invoice_no: "Rechnungsnummer",
    invoice_date: "Rechnungsdatum",
    document_no: "Belegnummer",
    document_date: "Belegdatum",
    service_date: "Leistungsdatum",
    order_no: "Bestellnummer",
    pos: "Pos.",
    description: "Bezeichnung",
    quantity: "Menge",
    unit_price: "Einzelpreis",
    net: "Netto",
    vat: "MwSt.",
    vat_on: "auf",
    vat_at: "zzgl.",
    gross: "Brutto",
    total_net: "Summe netto",
    total_gross: "Gesamtbetrag",
    payment_terms: "Zahlbar ohne Abzug bis zum",
    bank_details: "Bankverbindung",
    cancels: "Storniert Rechnung",
    refers_to: "Bezieht sich auf Rechnung",
    from_date: "vom",
    refund_note: "Der ausgewiesene Betrag wird Ihnen erstattet.",
  },

  en: {
    invoice: "Invoice",
    cancellation: "Cancellation invoice",
    credit_note: "Invoice correction",
    billing_to: "Billing address",
    invoice_no: "Invoice number",
    invoice_date: "Invoice date",
    document_no: "Document number",
    document_date: "Document date",
    service_date: "Date of supply",
    order_no: "Order number",
    pos: "No.",
    description: "Description",
    quantity: "Qty",
    unit_price: "Unit price",
    net: "Net",
    vat: "VAT",
    vat_on: "on",
    vat_at: "plus",
    gross: "Gross",
    total_net: "Net total",
    total_gross: "Total amount",
    payment_terms: "Payable without deduction by",
    bank_details: "Bank details",
    cancels: "Cancels invoice",
    refers_to: "Refers to invoice",
    from_date: "dated",
    refund_note: "The amount shown will be refunded to you.",
  },

  fr: {
    invoice: "Facture",
    cancellation: "Facture d'annulation",
    credit_note: "Rectificatif de facture",
    billing_to: "Adresse de facturation",
    invoice_no: "Numéro de facture",
    invoice_date: "Date de facture",
    document_no: "Numéro du document",
    document_date: "Date du document",
    service_date: "Date de livraison",
    order_no: "Numéro de commande",
    pos: "N°",
    description: "Désignation",
    quantity: "Qté",
    unit_price: "Prix unitaire",
    net: "HT",
    vat: "TVA",
    vat_on: "sur",
    vat_at: "plus",
    gross: "TTC",
    total_net: "Total HT",
    total_gross: "Montant total",
    payment_terms: "Payable sans escompte avant le",
    bank_details: "Coordonnées bancaires",
    cancels: "Annule la facture",
    refers_to: "Se rapporte à la facture",
    from_date: "du",
    refund_note: "Le montant indiqué vous sera remboursé.",
  },

  nl: {
    invoice: "Factuur",
    cancellation: "Annuleringsfactuur",
    credit_note: "Factuurcorrectie",
    billing_to: "Factuuradres",
    invoice_no: "Factuurnummer",
    invoice_date: "Factuurdatum",
    document_no: "Documentnummer",
    document_date: "Documentdatum",
    service_date: "Leveringsdatum",
    order_no: "Bestelnummer",
    pos: "Nr.",
    description: "Omschrijving",
    quantity: "Aantal",
    unit_price: "Stukprijs",
    net: "Netto",
    vat: "Btw",
    vat_on: "over",
    vat_at: "plus",
    gross: "Bruto",
    total_net: "Totaal netto",
    total_gross: "Totaalbedrag",
    payment_terms: "Betaalbaar zonder korting vóór",
    bank_details: "Bankgegevens",
    cancels: "Annuleert factuur",
    refers_to: "Heeft betrekking op factuur",
    from_date: "van",
    refund_note: "Het vermelde bedrag wordt aan u terugbetaald.",
  },
};

/** Betreff und Text der Mail, mit der ein Dokument verschickt wird. */
export type MailTexts = {
  greeting: string;
  closing: string;
  invoice: { subject: string; intro: string };
  cancellation: { subject: string; intro: string };
  credit_note: { subject: string; intro: string };
};

export const INVOICE_MAIL_TEXTS: Record<SupportedLanguage, MailTexts> = {
  de: {
    greeting: "Guten Tag,",
    closing: "Freundliche Grüße",
    invoice: {
      subject: "Ihre Rechnung {number}",
      intro: "anbei erhalten Sie Ihre Rechnung {number} zur Bestellung {reference}.",
    },
    cancellation: {
      subject: "Stornorechnung {number}",
      intro:
        "anbei erhalten Sie die Stornorechnung {number}. " +
        "Sie hebt die Rechnung {corrects} vollständig auf.",
    },
    credit_note: {
      subject: "Rechnungskorrektur {number}",
      intro:
        "anbei erhalten Sie die Rechnungskorrektur {number} zur Rechnung {corrects}.",
    },
  },

  en: {
    greeting: "Hello,",
    closing: "Kind regards",
    invoice: {
      subject: "Your invoice {number}",
      intro: "please find attached your invoice {number} for order {reference}.",
    },
    cancellation: {
      subject: "Cancellation invoice {number}",
      intro:
        "please find attached cancellation invoice {number}. " +
        "It cancels invoice {corrects} in full.",
    },
    credit_note: {
      subject: "Invoice correction {number}",
      intro:
        "please find attached invoice correction {number} for invoice {corrects}.",
    },
  },

  fr: {
    greeting: "Bonjour,",
    closing: "Cordialement",
    invoice: {
      subject: "Votre facture {number}",
      intro:
        "veuillez trouver ci-joint votre facture {number} " +
        "pour la commande {reference}.",
    },
    cancellation: {
      subject: "Facture d'annulation {number}",
      intro:
        "veuillez trouver ci-joint la facture d'annulation {number}. " +
        "Elle annule intégralement la facture {corrects}.",
    },
    credit_note: {
      subject: "Rectificatif de facture {number}",
      intro:
        "veuillez trouver ci-joint le rectificatif {number} " +
        "relatif à la facture {corrects}.",
    },
  },

  nl: {
    greeting: "Goedendag,",
    closing: "Met vriendelijke groet",
    invoice: {
      subject: "Uw factuur {number}",
      intro: "bijgaand ontvangt u uw factuur {number} bij bestelling {reference}.",
    },
    cancellation: {
      subject: "Annuleringsfactuur {number}",
      intro:
        "bijgaand ontvangt u annuleringsfactuur {number}. " +
        "Deze annuleert factuur {corrects} volledig.",
    },
    credit_note: {
      subject: "Factuurcorrectie {number}",
      intro: "bijgaand ontvangt u factuurcorrectie {number} bij factuur {corrects}.",
    },
  },
};
