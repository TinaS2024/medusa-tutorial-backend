/**
 * Wie die Kennnummern des Verkäufers heißen – abhängig davon, in welchem
 * Land er sitzt, NICHT davon, in welcher Sprache die Rechnung ist.
 *
 * "SIRET" oder "KvK-nummer" sind Eigennamen. Ein französischer Kunde eines
 * niederländischen Betreibers liest "KvK-nummer", nicht eine französische
 * Umschreibung – sonst wüsste niemand, welche Nummer gemeint ist.
 *
 * Die Zuordnung deckt die üblichen Angaben ab. Welche davon im Einzelfall
 * Pflicht sind, bestätigt die Steuerberatung des jeweiligen Betreibers.
 */
export type SellerLabels = {
  /** Feld invoice_tax_number aus den Rechnungs-Einstellungen. */
  tax_number: string;
  /** Feld imprint_vat_id aus dem Impressum. */
  vat_id: string;
  /** Feld imprint_register aus dem Impressum. */
  register: string;
};

const LABELS: Record<string, SellerLabels> = {
  de: {
    tax_number: "Steuernummer",
    vat_id: "USt-IdNr.",
    register: "Registereintrag",
  },
  fr: {
    tax_number: "SIRET",
    vat_id: "N° TVA intracom.",
    register: "RCS",
  },
  nl: {
    tax_number: "Fiscaal nummer",
    vat_id: "Btw-nummer",
    register: "KvK-nummer",
  },
  gb: {
    tax_number: "UTR",
    vat_id: "VAT reg. no.",
    register: "Company reg. no.",
  },
};

/** Fällt auf Deutschland zurück, wenn kein gültiges Land eingestellt ist. */
export const sellerLabels = (country: string): SellerLabels =>
  LABELS[country] ?? LABELS.de;
