import crypto from "crypto";
import {InjectTransactionManager,MedusaContext,MedusaError,MedusaService} from "@medusajs/framework/utils";
import type { Context } from "@medusajs/framework/types";


import { GiftCard } from "./models/gift-card";
import { GiftCardRedemption } from "./models/gift-card-redemption";

/**
 * Zeichen für die Codes – ohne 0/O und 1/I/L, die auf einer gedruckten
 * Karte leicht verwechselt werden.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Erzeugt einen Code wie "GK-7KQM-R4XT-9HWP".
 *
 * crypto.randomInt statt Math.random: Math.random ist für Codes, die Geld
 * wert sind, nicht zufällig genug.
 */
export function generateGiftCardCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) 
  {
    let group = "";
    for (let i = 0; i < 4; i++) 
    {
      group += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return `GK-${groups.join("-")}`;
}

/**
 * Ablaufdatum: Ende des Kaufjahres plus validYears Jahre. So rechnet die
 * regelmäßige Verjährung in Deutschland (3 Jahre ab Jahresende).
 */
export function giftCardExpiry(issuedAt: Date, validYears: number): Date {
  return new Date(Date.UTC(issuedAt.getUTCFullYear() + validYears, 11, 31, 23, 59, 59));
}

export default class GiftCardModuleService extends MedusaService({
  GiftCard,
  GiftCardRedemption,
}) {
  /**
   * Legt eine neue Geschenkkarte mit frischem Code an.
   *
   * Ein doppelter Code ist praktisch ausgeschlossen. Falls es doch passiert,
   * wird einfach ein neuer gezogen – höchstens fünfmal.
   */
  async issueGiftCard(input: {
    amount_cents: number;
    currency_code: string;
    order_id?: string | null;
    valid_years: number;
  }) {
    const issuedAt = new Date();

    for (let attempt = 1; attempt <= 5; attempt++) 
    {
      const code = generateGiftCardCode();
      const [existing] = await this.listGiftCards({ code }, { take: 1 });
      if (existing) continue;

      return await this.createGiftCards({
        code,
        initial_amount_cents: input.amount_cents,
        balance_cents: input.amount_cents,
        currency_code: input.currency_code,
        order_id: input.order_id ?? null,
        expires_at: giftCardExpiry(issuedAt, input.valid_years),
      });
    }

    throw new Error("Es konnte kein freier Geschenkkarten-Code erzeugt werden.");
  }

  
  /**
   * Bucht einen Betrag von einer Karte ab – für einen bestimmten Warenkorb.
   *
   * Der UPDATE-Befehl bucht nur ab, wenn genug Guthaben da ist und die Karte
   * gültig ist – Prüfen und Abbuchen in EINEM Schritt, wie bei den
   * Rechnungsnummern. Lösen zwei Kunden dieselbe Karte gleichzeitig ein,
   * kommt nur einer durch.
   *
   * Gibt die id der neuen Einlösung zurück, oder null, wenn für diesen
   * Warenkorb schon abgebucht war (Bestellabschluss lief zweimal).
   */
  @InjectTransactionManager()
  async redeemForCart(
    input: { gift_card_id: string; cart_id: string; amount_cents: number },
    @MedusaContext() sharedContext: Context = {}
  ): Promise<string | null> {
    const manager = sharedContext.transactionManager as any;

    const existing = await manager.execute(
      `SELECT "id" FROM "gift_card_redemption"
        WHERE "gift_card_id" = ? AND "cart_id" = ? AND "deleted_at" IS NULL
        LIMIT 1`,
      [input.gift_card_id, input.cart_id]
    );
    if (existing?.length) return null;

    const rows = await manager.execute(
      `UPDATE "gift_card"
          SET "balance_cents" = "balance_cents" - ?,
              "updated_at"    = now()
        WHERE "id" = ?
          AND "deleted_at" IS NULL
          AND "is_disabled" = false
          AND "balance_cents" >= ?
          AND ("expires_at" IS NULL OR "expires_at" > now())
      RETURNING "id"`,
      [input.amount_cents, input.gift_card_id, input.amount_cents]
    );

    if (!rows?.length) 
    {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Das Guthaben der Geschenkkarte reicht nicht mehr aus oder sie ist nicht mehr gültig. " +
          "Bitte entfernen Sie die Geschenkkarte und lösen Sie sie erneut ein."
      );
    }

    const redemption = await this.createGiftCardRedemptions(
      {
        gift_card_id: input.gift_card_id,
        cart_id: input.cart_id,
        amount_cents: input.amount_cents,
      },
      sharedContext
    );

    return redemption.id;
  }

  /**
   * Macht Einlösungen rückgängig: Betrag zurück auf die Karte, Einlösung
   * löschen. Läuft, wenn die Bestellung nach dem Abbuchen doch scheitert
   * (z. B. Kartenzahlung abgelehnt).
   *
   * Eine schon gelöschte Einlösung wird übersprungen – so schadet es nicht,
   * wenn das zweimal aufgerufen wird.
   */
  @InjectTransactionManager()
  async undoRedemptions(
    redemptionIds: string[],
    @MedusaContext() sharedContext: Context = {}
  ): Promise<void> {
    const manager = sharedContext.transactionManager as any;

    for (const id of redemptionIds) 
    {
      const rows = await manager.execute(
        `DELETE FROM "gift_card_redemption" WHERE "id" = ?
         RETURNING "gift_card_id", "amount_cents"`,
        [id]
      );
      const row = rows?.[0];
      if (!row) continue;

      await manager.execute(
        `UPDATE "gift_card"
            SET "balance_cents" = "balance_cents" + ?,
                "updated_at"    = now()
          WHERE "id" = ?`,
        [row.amount_cents, row.gift_card_id]
      );
    }
  }

  
  /**
   * Bucht alles, was eine Bestellung von Geschenkkarten abgebucht hat,
   * zurück auf die Karten – für Stornos.
   *
   * Je Karte wird die Summe aller Einlösungen dieser Bestellung gebildet
   * (Abbuchungen positiv, Rückbuchungen negativ). Ist sie größer als 0,
   * wird genau dieser Betrag zurückgebucht und als negative Einlösung
   * vermerkt. Läuft das ein zweites Mal, ist die Summe 0 – dann passiert
   * nichts mehr.
   *
   * Gibt die Summe der zurückgebuchten Cent zurück.
   */
  @InjectTransactionManager()
  async refundOrderRedemptions(
    orderId: string,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<number> {
    const manager = sharedContext.transactionManager as any;

    const rows = await manager.execute(
      `SELECT "gift_card_id", SUM("amount_cents")::int AS "net"
         FROM "gift_card_redemption"
        WHERE "order_id" = ? AND "deleted_at" IS NULL
        GROUP BY "gift_card_id"
       HAVING SUM("amount_cents") > 0`,
      [orderId]
    );

    let refundedCents = 0;

    for (const row of rows ?? []) 
    {
      const net = Number(row.net);

      await manager.execute(
        `UPDATE "gift_card"
            SET "balance_cents" = "balance_cents" + ?,
                "updated_at"    = now()
          WHERE "id" = ?`,
        [net, row.gift_card_id]
      );

      await this.createGiftCardRedemptions(
        {
          gift_card_id: row.gift_card_id,
          order_id: orderId,
          cart_id: null,
          amount_cents: -net,
        },
        sharedContext
      );

      refundedCents += net;
    }

    return refundedCents;
  }

}
