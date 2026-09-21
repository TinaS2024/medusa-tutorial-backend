import type { InvoiceData } from "./build-invoice-data";
import { INVOICE_TEXTS } from "./texts";
import { sellerLabels } from "./country-rules";

/**
 * Nur die Teile von pdfmake, die wir benutzen. Eigene Typen statt
 * @types/pdfmake, weil das Typpaket noch die alte Schnittstelle von
 * Version 0.2 beschreibt.
 */
type PdfMake = {
  setUrlAccessPolicy(callback: (url: string) => boolean): void;
  setLocalAccessPolicy(callback: (resource: string) => boolean): void;
  setFonts(fonts: Record<string, Record<string, string>>): void;
  createPdf(doc: any): { getBuffer(): Promise<Buffer> };
};

// pdfmake liefert eine fertige Instanz statt einer Klasse – deshalb kein `new`.
const pdfmake = require("pdfmake") as PdfMake;

/**
 * Die vier eingebauten Helvetica-Schnitte. pdfmake bringt sie mit, es
 * müssen also KEINE Schriftdateien mit ausgeliefert werden. Sie decken
 * Deutsch, Englisch, Französisch und Niederländisch ab.
 */
const STANDARD_FONTS = [
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
];

let configured = false;

/** Einmalige Einrichtung. Läuft beim ersten Rechnungsdruck, danach nie wieder. */
function configure() {
  if (configured) return;

  // Keine Downloads aus dem Netz und keine Dateien von der Festplatte.
  // Die Ausnahme für die Schriftnamen ist nötig – ohne sie schlägt schon
  // das Laden von Helvetica fehl.
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((resource: string) => STANDARD_FONTS.includes(resource));

  pdfmake.setFonts({
    Helvetica: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
  });

  configured = true;
}

export function renderInvoicePdf(args: {
  data: InvoiceData;
  number: string;
  issuedAt: Date;
  serviceDate: Date | null;
  documentType?: "invoice" | "cancellation" | "credit_note";
  corrects?: { number: string; issuedAt: Date } | null;
}): Promise<Buffer> {
  configure();

  const { data, number, issuedAt, serviceDate } = args;
  
  // Sprache des Käufers für die Beschriftungen …
  const t = INVOICE_TEXTS[data.language] ?? INVOICE_TEXTS.de;

  // … Sitzland des Verkäufers für die Kennnummern.
  const labels = sellerLabels(data.seller.country);


  // Vorgabe "invoice", damit alle bestehenden Aufrufe unverändert laufen.
  const documentType = args.documentType ?? "invoice";
  const corrects = args.corrects ?? null;
  const isCorrection = documentType !== "invoice";

  const title = isCorrection ? t[documentType] : t.invoice;
  const numberLabel = isCorrection ? t.document_no : t.invoice_no;
  const dateLabel = isCorrection ? t.document_date : t.invoice_date;


  const money = (amount: number) =>
    new Intl.NumberFormat(data.locale, {
      style: "currency",
      currency: data.currency_code,
    }).format(amount);

  const day = (value: Date) =>
    new Intl.DateTimeFormat(data.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(value);

  const allLines = data.shipping ? [...data.lines, data.shipping] : data.lines;

  const dueDate = new Date(issuedAt);
  dueDate.setDate(dueDate.getDate() + data.payment_terms_days);

  const tableBody = [
    [
      { text: t.pos, style: "th" },
      { text: t.description, style: "th" },
      { text: t.quantity, style: "th", alignment: "right" },
      { text: t.unit_price, style: "th", alignment: "right" },
      { text: t.net, style: "th", alignment: "right" },
      { text: t.vat, style: "th", alignment: "right" },
      { text: t.gross, style: "th", alignment: "right" },
    ],
    ...allLines.map((line) => [
      { text: String(line.position) },
      {
        stack: [
          { text: line.title },
          ...(line.description ? [{ text: line.description, style: "subtle" }] : []),
        ],
      },
      { text: String(line.quantity), alignment: "right" },
      { text: money(line.unit_price), alignment: "right" },
      { text: money(line.net), alignment: "right" },
      { text: `${line.tax_rate} %`, alignment: "right" },
      { text: money(line.gross), alignment: "right" },
    ]),
  ];

  // Steuer je Satz ausweisen ist Pflicht – auch wenn es wie hier nur einer ist.
  const totalsBody = [
    [{ text: t.total_net }, { text: money(data.total_net), alignment: "right" }],
    ...data.tax_groups.map((g) => [
      { text: `${t.vat_at} ${g.rate} % ${t.vat} ${t.vat_on} ${money(g.net)}` },
      { text: money(g.tax), alignment: "right" },
    ]),
    [
      { text: t.total_gross, bold: true },
      { text: money(data.total_gross), bold: true, alignment: "right" },
    ],
  ];

  const sellerFooter = [
    data.seller.company,
    data.seller.address,
     data.seller.tax_number ? `${labels.tax_number}: ${data.seller.tax_number}` : null,
    data.seller.vat_id ? `${labels.vat_id}: ${data.seller.vat_id}` : null,
    data.seller.register ? `${labels.register}: ${data.seller.register}` : null,
    data.seller.email,
  ].filter(Boolean);

  const bankLines = [
    data.bank.account_holder,
    data.bank.bank_name,
    data.bank.iban ? `IBAN: ${data.bank.iban}` : null,
    data.bank.bic ? `BIC: ${data.bank.bic}` : null,
  ].filter(Boolean);

  const doc = {
    pageSize: "A4",
    pageMargins: [56, 48, 56, 72],
    defaultStyle: { font: "Helvetica", fontSize: 9, lineHeight: 1.2 },

    styles: {
      th: { bold: true, fontSize: 9 },
      subtle: { fontSize: 8, color: "#666666" },
      h1: { fontSize: 16, bold: true },
      label: { fontSize: 8, color: "#666666" },
    },

    // Die Pflichtangaben des Verkäufers stehen auf jeder Seite.
    footer: (currentPage: number, pageCount: number) => ({
      margin: [56, 0, 56, 0],
      columns: [
        { text: sellerFooter.join("  ·  "), style: "subtle" },
        {
          text: `${currentPage} / ${pageCount}`,
          style: "subtle",
          alignment: "right",
          width: 40,
        },
      ],
    }),

    content: [
      {
        text: [data.seller.company, data.seller.address].filter(Boolean).join(" · "),
        style: "subtle",
        alignment: "right",
      },

      { text: " ", margin: [0, 8, 0, 0] },

      {
        columns: [
          {
            width: "*",
            stack: [
              { text: t.billing_to, style: "label" },
              ...(data.buyer.company ? [{ text: data.buyer.company }] : []),
              { text: data.buyer.name },
              ...data.buyer.address_lines.map((l) => ({ text: l })),
            ],
          },
          {
            width: 190,
            table: {
              widths: ["auto", "*"],
              body: [
                [
                  { text: numberLabel, style: "label" },
                  { text: number, alignment: "right", bold: true },
                ],
                [
                  { text: dateLabel, style: "label" },
                  { text: day(issuedAt), alignment: "right" },
                ],
                ...(serviceDate
                  ? [[
                      { text: t.service_date, style: "label" },
                      { text: day(serviceDate), alignment: "right" },
                    ]]
                  : []),
                [
                  { text: t.order_no, style: "label" },
                  { text: data.order_reference, alignment: "right" },
                ],
              ],
            },
            layout: "noBorders",
          },
        ],
      },

      { text: `${title} ${number}`, style: "h1", margin: [0, 28, 0, 6] },

      // Pflichtangabe bei Korrekturen: auf welche Rechnung sie sich bezieht.
      ...(corrects
        ? [{
            text:
              `${documentType === "cancellation" ? t.cancels : t.refers_to} ` +
              `${corrects.number} ${t.from_date} ${day(corrects.issuedAt)}`,
            style: "subtle",
            margin: [0, 0, 0, 14],
          }]
        : [{ text: " ", margin: [0, 0, 0, 8] }]),
      {
        table: { headerRows: 1, widths: [26, "*", 34, 58, 58, 32, 62], body: tableBody },
        layout: {
          hLineWidth: (i: number, node: any) =>
            i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3,
          vLineWidth: () => 0,
          hLineColor: (i: number) => (i <= 1 ? "#333333" : "#dddddd"),
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
      },

      {
        margin: [0, 14, 0, 0],
        columns: [
          { width: "*", text: "" },
          {
            width: 230,
            table: { widths: ["*", 76], body: totalsBody },
            layout: {
              hLineWidth: (i: number, node: any) =>
                i === node.table.body.length - 1 ? 0.8 : 0,
              vLineWidth: () => 0,
              hLineColor: () => "#333333",
              paddingTop: () => 3,
              paddingBottom: () => 3,
            },
          },
        ],
      },

      // Bei einer Korrektur gibt es nichts zu zahlen – stattdessen der
      // Hinweis auf die Erstattung, und keine Bankverbindung.
      ...(isCorrection
        ? [{ margin: [0, 24, 0, 0], text: t.refund_note }]
        : [{ margin: [0, 24, 0, 0], text: `${t.payment_terms} ${day(dueDate)}.` }]),

      ...(!isCorrection && bankLines.length

        ? [{
            margin: [0, 14, 0, 0],
            stack: [
              { text: t.bank_details, bold: true },
              ...bankLines.map((l) => ({ text: l })),
            ],
          }]
        : []),

      ...(data.footer_note
        ? [{ margin: [0, 18, 0, 0], text: data.footer_note, style: "subtle" }]
        : []),
    ],
  };

  return pdfmake.createPdf(doc).getBuffer();
}
