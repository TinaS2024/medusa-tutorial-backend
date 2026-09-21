import {
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils";
import type { Context } from "@medusajs/framework/types";

import { Invoice } from "./models/invoice";
import { InvoiceNumberSeries } from "./models/invoice-number-series";

/** Die beiden Nummernkreise, die es gibt. */
export type SeriesId = "invoice" | "correction";

export default class InvoiceModuleService extends MedusaService({
  Invoice,
  InvoiceNumberSeries,
}) {
  /**
   * Zieht die nächste freie Nummer aus einem Nummernkreis.
   *
   * Der ganze Trick steckt in dem einen UPDATE-Befehl unten: Er liest und
   * erhöht den Zähler in einem einzigen Schritt. Postgres sperrt die Zeile
   * dabei automatisch. Fragen zwei Bestellungen gleichzeitig nach einer
   * Nummer, muss die zweite warten und bekommt danach garantiert die
   * nächste – niemals dieselbe.
   *
   * Falsch wäre: erst lesen, dann im Code +1 rechnen, dann schreiben.
   * Dazwischen kann die zweite Bestellung denselben alten Wert lesen.
   */
  @InjectTransactionManager()
  async nextNumber(
    seriesId: SeriesId,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<string> {
    const manager = sharedContext.transactionManager as any;

    const rows = await manager.execute(
      `UPDATE "invoice_number_series"
          SET "last_number" = "last_number" + 1,
              "updated_at"  = now()
        WHERE "id" = ?
      RETURNING "prefix", "pad_length", "last_number"`,
      [seriesId]
    );

    const row = rows?.[0];

    if (!row) {
      throw new Error(
        `Nummernkreis "${seriesId}" fehlt. Bitte im Admin die Rechnungs-Einstellungen einmal speichern.`
      );
    }

    const padded = String(row.last_number).padStart(Number(row.pad_length), "0");
    return `${row.prefix ?? ""}${padded}`;
  }

  /**
   * Legt einen Nummernkreis an, falls er noch fehlt.
   *
   * Wird beim Speichern der Rechnungs-Einstellungen aufgerufen. Bei einer
   * frischen Kunden-Installation ist die Tabelle leer – hier entstehen die
   * beiden Zeilen zum ersten Mal.
   */
  async ensureSeries( seriesId: SeriesId, prefix: string, padLength: number): Promise<void> {
  const [existing] = await this.listInvoiceNumberSeries(

      { id: seriesId },
      { take: 1 }
    );


    if (existing) 
    {
      // Präfix und Länge darf der Betreiber ändern.
      // last_number rühren wir NIE an – sonst entstünden doppelte Nummern.
      await this.updateInvoiceNumberSeries({
        id: seriesId,
        prefix,
        pad_length: padLength,
      });
      return;
    }

    await this.createInvoiceNumberSeries({
      id: seriesId,
      prefix,
      pad_length: padLength,
      last_number: 0,
    });
  }

    /**
   * Zieht eine Nummer und legt damit die Rechnungszeile an – beides in
   * einer Transaktion.
   *
   * Damit gibt es keinen Zustand, in dem eine Nummer verbraucht ist, aber
   * keine Rechnung dazu existiert. Genau das wäre eine Lücke.
   *
   * `nextNumber` bekommt den Kontext weitergereicht und erkennt daran,
   * dass es bereits in einer Transaktion läuft – es macht dann keine
   * zweite auf.
   */
  @InjectTransactionManager()
  async createInvoiceWithNumber(
    series: SeriesId,
    payload: Record<string, any>,
    @MedusaContext() sharedContext: Context = {}
  ) {
    const number = await this.nextNumber(series, sharedContext);

    const [invoice] = await this.createInvoices(
      [{ ...payload, number }],
      sharedContext
    );

    return invoice;
  }

}
