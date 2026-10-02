import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import { join } from "path";

/**
 * Kundenimport aus GPE. Liest das JSON von order2gpe/export-customers.py und
 * legt daraus Medusa-Kunden MIT Konto an.
 *
 * Aufruf im Verzeichnis medusa-backend:
 *   npm run customers:import            – Probelauf, schreibt nichts
 *   npm run customers:import -- write   – legt die Kunden wirklich an
 *
 * Warum mit Konto und nicht als Gast: has_account lässt sich nachträglich nicht
 * ändern (UpdateCustomerDTO kennt das Feld nicht), und die Registrierung im
 * Storefront legt immer einen NEUEN Kunden an, ohne nach einem vorhandenen mit
 * derselben Mailadresse zu suchen. Ein Gast-Import würde also Doppelgänger
 * erzeugen, sobald sich jemand selbst anmeldet.
 *
 * Warum JSON und nicht CSV: im JSON stehen Adressen und Kontakte noch als
 * Liste, und der Semikolon- und BOM-Ärger vom Produktimport entfällt.
 */

const INPUT_FILE = "kunden.json";

// Nach so vielen Kunden eine Zwischenmeldung – bei 4227 Stück will man sehen,
// dass es vorangeht.
const PROGRESS_EVERY = 50;

type Stats = {
  withoutEmail: string[];
  duplicateEmail: string[];
  alreadyThere: string[];
  unknownCountry: Set<string>;
  skippedAddresses: number;
  withoutAddress: number;
  blockedCustomers: string[];
};


/**
 * Die Mailadresse des Kunden. GPE führt sie an der Firma – 97,9 Prozent der
 * Kunden haben eine. Fehlt sie, springt der erste Kontakt mit Mailadresse ein.
 * Kleingeschrieben, weil Medusa die Eindeutigkeit über das Feld prüft und
 * "Info@..." sonst neben "info@..." bestehen könnte.
 */
const pickEmail = (customer: any): string | undefined => {
  const direct = String(customer.email ?? "").trim();
  if (direct) return direct.toLowerCase();
  for (const contact of customer.contacts ?? []) {
    const mail = String(contact.email ?? "").trim();
    if (mail) return mail.toLowerCase();
  }
  return undefined;
};

/**
 * Medusa erwartet das Länderkürzel klein und zweistellig (ISO 3166-1). In
 * welchem Format GPE es liefert, wissen wir nicht – alles andere als zwei
 * Buchstaben wird deshalb verworfen und gemeldet, statt den Import mit
 * falschen Ländern zu füllen.
 */
const toCountryCode = (value: any, stats: Stats): string | undefined => {
  const text = String(value ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(text)) return text.toLowerCase();
  if (text) stats.unknownCountry.add(text);
  return undefined;
};

/**
 * Eine Adresse ohne Straße oder ohne Ort ist in GPE ein Platzhalter – in der
 * Stichprobe traf das 46 von 172 Adressen, durchweg den zweiten Eintrag vom
 * Typ 1. Die gehören nicht nach Medusa.
 */
const hasContent = (address: any): boolean =>
  Boolean(String(address.line1 ?? "").trim()) &&
  Boolean(String(address.city ?? "").trim());

/**
 * Postleitzahl ohne vorangestelltes Länderkürzel. GPE hat meist nur Ziffern,
 * bei einzelnen Sätzen steht das Land davor ("BE4731" statt "4731").
 */
const cleanPostalCode = (value: any): string | undefined => {
  const text = String(value ?? "").trim();
  const match = text.match(/^[A-Za-z]{2}-?(\d+)$/);
  return (match ? match[1] : text) || undefined;
};

/**
 * Eine GPE-Adresse als Medusa-Adresse. Medusa trennt Vor- und Nachname, GPE hat
 * nur das eine Feld 'addressee' – das wandert in first_name, aber nur wenn es
 * sich vom Firmennamen unterscheidet, sonst stünde der doppelt da.
 *
 * Kein address_name: GPEs externalDescription enthält keinen Text, sondern den
 * JSON-Schnipsel {"isDefault":true}.
 */
const toAddress = (
  address: any,
  company: string,
  isDefaultBilling: boolean,
  isDefaultShipping: boolean,
  stats: Stats
) => {
  const addressee = String(address.addressee ?? "").trim();
  const extraLines = [address.line2, address.line3]
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .join(", ");

  return {
    company: company || undefined,
    first_name: addressee && addressee !== company ? addressee : undefined,
    address_1: String(address.line1 ?? "").trim() || undefined,
    address_2: extraLines || undefined,
    postal_code: cleanPostalCode(address.postalCode),
    city: String(address.city ?? "").trim() || undefined,
    province: String(address.state ?? "").trim() || undefined,
    country_code: toCountryCode(address.country, stats),
    phone: String(address.phone ?? "").trim() || undefined,
    is_default_billing: isDefaultBilling,
    is_default_shipping: isDefaultShipping,
    metadata: {
      gpe_address_number: address.number ?? null,
      gpe_address_type: address.type ?? null,
      gpe_external_id: address.externalID ?? null,
    },
  };
};


/**
 * Welche Adresse ist die vorausgewählte? GPEs Feld isDefault hilft dabei nicht:
 * es gilt je Adresstyp, in der Stichprobe hatten 40 von 50 Kunden drei Adressen
 * mit isDefault=true. Verlässlich ist nur der Typ, laut CLAUDE.md:
 * 1 = Besuchs- und Rechnungsadresse, 4 = Lieferadresse.
 *
 * Medusa trennt Rechnungs- und Lieferadresse, wir setzen trotzdem beide auf die
 * Typ-1-Adresse. Grund: Typ 4 ist in GPE die ABWEICHENDE Lieferadresse, also der
 * Ausnahmefall, und in den Daten stecken Testsätze. Eine vorausgewählte
 * Testadresse im Kassenbereich wäre schlimmer als die Firmenadresse. Die Typ-3-
 * und Typ-4-Adressen kommen mit, nur eben nicht als Voreinstellung.
 */
const defaultAddressIndex = (addresses: any[]): number => {
  const byType = addresses.findIndex((address) => String(address.type) === "1");
  return byType >= 0 ? byType : 0;
};


/**
 * Ein GPE-Kunde als Medusa-Kunde. Medusa hat nur sieben eigene Felder für
 * Kunden – alles Übrige aus GPE kommt nach metadata, mit demselben gpe_-
 * Vorsatz wie bei den Produkten, damit die Herkunft erkennbar bleibt.
 */
const toCustomer = (customer: any, email: string, stats: Stats) => {
  const company = String(customer.company ?? "").trim();
  const allAddresses = customer.addresses ?? [];
  const addresses = allAddresses.filter(hasContent);
  stats.skippedAddresses += allAddresses.length - addresses.length;

  const defaultIndex = defaultAddressIndex(addresses);
  if (!addresses.length) stats.withoutAddress++;
  const listData = customer.listData ?? {};
  const listCode = (key: string) => listData[key]?.code ?? null;


  return {
    company_name: company || undefined,
    email,
    phone: String(customer.phone ?? "").trim() || undefined,
    addresses: addresses.map((address: any, index: number) =>
      toAddress(
        address,
        company,
        index === defaultIndex,
        index === defaultIndex,

        stats
      )
    ),

    metadata: {
      gpe_id: String(customer.id),
      gpe_external_id: customer.externalID ?? null,
      gpe_vat_number: customer.vatNumber ?? null,
      gpe_siren: customer.siren ?? null,
      gpe_language: customer.language ?? null,
      gpe_homepage: customer.homepage ?? null,
      gpe_fax: customer.fax ?? null,
      gpe_status: customer.status ?? null,
      gpe_currency: listCode("currency"),
      gpe_vat_liability: listCode("vatLiability"),
      gpe_payment_condition: listCode("paymentCondition"),
      gpe_shipping_method: listCode("shippingMethod"),
      gpe_contact_count: (customer.contacts ?? []).length,
    },
  };
};

export default async function importCustomers({
  container,
  args,
}: {
  container: any;
  args?: string[];
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const authModuleService = container.resolve(Modules.AUTH);
  const storeModuleService = container.resolve(Modules.STORE);

  // Ohne das bloße Wort 'write' läuft nur der Probelauf – derselbe Schalter wie
  // in set-designer-metadata.ts. '--write' geht nicht: die Flags vor dem
  // Skriptnamen beansprucht medusa exec für sich.
  const shouldWrite = (args ?? []).includes("write");

  // Ohne SMTP kommt kein Kunde in sein Konto: das Zufallspasswort kennt niemand,
  // und "Passwort vergessen" braucht einen Versandweg.
  const [store] = await storeModuleService.listStores({}, { take: 1 });
  const storeMetadata = (store?.metadata as Record<string, unknown> | null) ?? null;
  if (!storeMetadata?.smtp_host) {
    logger.warn(
      "[kunden] Im Admin sind keine SMTP-Daten hinterlegt. Die Konten werden " +
        "angelegt, aber niemand kann sich ein Passwort zuschicken lassen."
    );
  }

  const raw = await fs.readFile(join(process.cwd(), INPUT_FILE), "utf-8");
  const gpeCustomers: any[] = JSON.parse(raw);
  logger.info(`[kunden] ${gpeCustomers.length} GPE-Kunden aus ${INPUT_FILE} geladen.`);

  // Schon vorhandene Mailadressen holen. Der eindeutige Index liegt auf dem
  // Paar email + has_account, ein zweiter Lauf würde sonst scheitern.
  const { data: existing } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
  });
  const knownEmails = new Set<string>(
    existing.map((c: any) => String(c.email ?? "").toLowerCase()).filter(Boolean)
  );
  logger.info(`[kunden] ${knownEmails.size} Mailadressen sind in Medusa schon vergeben.`);

  const stats: Stats = {
    withoutEmail: [],
    duplicateEmail: [],
    alreadyThere: [],
    unknownCountry: new Set(),
    skippedAddresses: 0,
    withoutAddress: 0,
    blockedCustomers: [],
  };

  const seenInFile = new Set<string>();
  const toCreate: { gpeId: string; email: string; data: any }[] = [];

  for (const gpeCustomer of gpeCustomers) {
  const gpeId = String(gpeCustomer.id);

    // Gesperrte Kunden gehören nicht in den Shop – dieselbe Strenge wie beim
    // Produktexport, wo nur aktive übernommen werden. GPE legt den Wert als
    // Text ab, nicht als Wahrheitswert. Im Vollexport war es genau ein Kunde.
    if (String((gpeCustomer.stringData ?? {}).blocked ?? "") === "true") {
      stats.blockedCustomers.push(gpeId);
      continue;
    }

  const email = pickEmail(gpeCustomer);


    if (!email) {
      stats.withoutEmail.push(gpeId);
      continue;
    }
    if (seenInFile.has(email)) {
      stats.duplicateEmail.push(gpeId);
      continue;
    }
    if (knownEmails.has(email)) {
      stats.alreadyThere.push(gpeId);
      continue;
    }
    seenInFile.add(email);
    toCreate.push({ gpeId, email, data: toCustomer(gpeCustomer, email, stats) });
  }

  logger.info(
    `[kunden] ${toCreate.length} anzulegen, ` +
      `${stats.alreadyThere.length} schon vorhanden, ` +
      `${stats.duplicateEmail.length} doppelte Mailadresse, ` +
      `${stats.withoutEmail.length} ohne Mailadresse, ` +
      `${stats.blockedCustomers.length} in GPE gesperrt.`
  );

if (stats.skippedAddresses) {
    logger.info(
      `[kunden] ${stats.skippedAddresses} Adresse(n) ohne Straße oder Ort ` +
        `übersprungen (GPE-Platzhalter).`
    );
  }
if (stats.withoutAddress) {
    logger.info(
      `[kunden] ${stats.withoutAddress} Kunde(n) bleiben ohne Adresse – in GPE ` +
        `stand dort nur ein Platzhalter.`
    );
  }

  if (stats.unknownCountry.size) {
    logger.warn(
      `[kunden] Länderangaben ohne zweistelliges Kürzel (bleiben leer): ` +
        `${[...stats.unknownCountry].slice(0, 10).join(", ")}`
    );
  }

  // Übersprungene nachvollziehbar machen – nur Kundennummer und Grund, keine
  // Namen oder Mailadressen, damit die Datei unbedenklich bleibt.
  const skipped = [
    ...stats.withoutEmail.map((id) => `${id};keine Mailadresse`),
    ...stats.duplicateEmail.map((id) => `${id};Mailadresse doppelt`),
    ...stats.alreadyThere.map((id) => `${id};in Medusa vorhanden`),
    ...stats.blockedCustomers.map((id) => `${id};in GPE gesperrt`),
  ];
  if (skipped.length) {
    await fs.writeFile(
      join(process.cwd(), "kunden-uebersprungen.csv"),
      ["gpe_id;grund", ...skipped].join("\n") + "\n",
      "utf-8"
    );
    logger.info(`[kunden] ${skipped.length} Zeilen in kunden-uebersprungen.csv.`);
  }

  if (!shouldWrite) {
    const sample = toCreate[0];
    if (sample) {
      logger.info(
        `[kunden] Probelauf – so sähe der erste Kunde aus:\n` +
          JSON.stringify({ ...sample.data, email: "(ausgeblendet)" }, null, 2)
      );
    }
    logger.info(`[kunden] Probelauf beendet, nichts geschrieben. Mit 'write' anlegen.`);
    return;
  }

  let created = 0;
  let failed = 0;

  for (const entry of toCreate) {
    try {
      // Zufallspasswort: Aus GPE können wir keine Passwörter übernehmen, und
      // ein ratbares wäre eine Sicherheitslücke. Es wird nirgends ausgegeben
      // und nach diesem Durchlauf vergessen – der Kunde kommt über
      // "Passwort vergessen" an sein Konto.
      const password = randomBytes(24).toString("base64url");

      // Der Typ AuthenticationInput erwartet eigentlich Felder einer
      // HTTP-Anfrage (url, headers, query). Im Skript gibt es die nicht,
      // gebraucht wird nur body – daher die Umtypung.
      const registration = await authModuleService.register("emailpass", {
        body: { email: entry.email, password },
      } as any);

      if (!registration.success || !registration.authIdentity) {
        throw new Error(registration.error ?? "Auth-Identität nicht angelegt");
      }

      await createCustomerAccountWorkflow(container).run({
        input: {
          authIdentityId: registration.authIdentity.id,
          customerData: entry.data,
        },
      });

      created++;
      if (created % PROGRESS_EVERY === 0) {
        logger.info(`[kunden] ${created} von ${toCreate.length} angelegt.`);
      }
    } catch (e: any) {
      failed++;
      logger.error(`[kunden] ✗ GPE-Kunde ${entry.gpeId}: ${e?.message ?? e}`);
    }
  }

  logger.info(`[kunden] Fertig: ${created} angelegt, ${failed} fehlgeschlagen.`);
}
