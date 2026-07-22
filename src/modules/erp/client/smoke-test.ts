/**
 * Smoke-Test für die GPE-Verbindung – läuft OHNE Medusa.
 *
 *   npx tsx src/modules/erp/client/smoke-test.ts
 *
 * (Falls tsx nicht da ist: npx tsx installiert es beim ersten Aufruf.)
 *
 * Erwartet die gpe_*-Variablen in der .env des Backends.
 * Ohne gültige Zugangsdaten schlägt Schritt 1 fehl – das ist der Punkt.
 */

import { config } from "dotenv"
import { GpeClient } from "./gpe-client"

config()

async function main() {

    const client = new GpeClient({
    server: process.env.gpe_server as string,
    user: process.env.gpe_user as string,
    password: process.env.gpe_password as string,
    companyId: process.env.gpe_company_id as string,
    host: process.env.gpe_host,
    port: process.env.gpe_port,
  })


  // --- 1. Token -------------------------------------------------------
  console.log("1) Token holen ...")
  const ok = await client.ping()
  console.log(ok ? "   ✓ Token erhalten" : "   ✗ Kein Token")
  if (!ok) {
    console.log("   → Zugangsdaten/Erreichbarkeit prüfen. Abbruch.")
    return
  }

  // --- 2. Kunde -------------------------------------------------------
  const testCustomerId = process.env.gpe_test_customer_id
  if (testCustomerId) {
    console.log(`2) Kunde ${testCustomerId} lesen ...`)
    const customer = await client.getCustomer(testCustomerId)
    if (!customer) {
      console.log("   ✗ Kein Kunde gefunden")
    } else {
      console.log("   ✓", {
        id: customer.id,
        company: customer.company,
        email: customer.email,
        language: customer.language,
        addresses: customer.addresses?.length ?? 0,
        designerDiscount: customer.stringData?.designerDiscount,
      })
    }
  } else {
    console.log("2) übersprungen – gpe_test_customer_id nicht gesetzt")
  }

  // --- 3. Produkte ----------------------------------------------------
  // "4911" ist ein Trodat-Printy, der im Rossini-System existiert.
  // Bei Bedarf auf eine Artikelnummer aus eurem Sortiment ändern.
  const testNames = ["4911"]
  console.log(`3) Produkte ${testNames.join(", ")} lesen ...`)
  const products = await client.getProductsByNames(testNames)
  console.log(`   ${products.length} Produkt(e)`)
  for (const p of products) {
    console.log("   ✓", {
      gpe_id: p.id,
      gpe_name: p.name,
      description: p.description,
      options: p.options?.length ?? 0,
      group: p.ProductGroup?.name,
    })
  }

  // --- 4. Preis / Kombination ----------------------------------------
  if (products.length > 0) {
    const p = products[0]
    console.log(`4) ProductInfoJson für ${p.name} (Defaults) ...`)
    const info = await client.getProductInfo({
      product: { gpe_id: p.id, gpe_name: p.name, externalID: p.externalID, description: p.description },
      count: 1,
      useDefaultOptionValues: true,
    })
    if (!info) {
      console.log("   ✗ Keine ProductInfo (dataPresent false)")
    } else {
      console.log("   ✓ Keys:", Object.keys(info).join(", "))
      console.log("   additionalFields:", info.additionalFields?.map((f) => f.fieldName))
      // Preis-Feld hier bewusst nicht geraten – einmal ansehen:
      console.log("   Rohantwort:", JSON.stringify(info, null, 2).slice(0, 2000))
    }
  }
  
  // --- 5. Discovery: Schreibpfad-Basis-URL ----------------------------
  console.log("5) config.json-Discovery – EXACTONLINE-URL ...")
  try {
    const exactUrl = await client.getExactOnlineBaseUrl()
    console.log("   ✓ EXACTONLINE:", exactUrl)
  } catch (err: any) {
    console.log("   ✗", err.message)
  }

  // --- 6. SCHREIBTEST gegen den Testkunden (nur mit WRITE_TEST=1) ------
  // Schreibt echte (Test-)Daten in EINEN GPE-Kunden – additiv, nicht
  // überschreibend. Absichtlich hinter einem Flag, damit ein normaler
  // Smoke-Run nichts schreibt.
  if (process.env.WRITE_TEST === "1" && testCustomerId) {
    console.log(`6) SCHREIBTEST: Adresse + Kontakt an ${testCustomerId} anhängen ...`)
    const testAddress = {
      firstName: "Test",
      lastName: "Schreibpfad",
      line1: "Teststraße 1",
      line2: "",
      postalCode: "12345",
      city: "Teststadt",
      country: "DE",
      email: "schreibtest@example.com",
    }
    try {
      const contact = await client.addContactToCustomerIfNotExists({
        gpeCustomerId: testCustomerId,
        address: testAddress,
      })
      console.log("   ✓ Kontakt:", contact)
      const address = await client.addAddressToCustomerIfNotExists({
        gpeCustomerId: testCustomerId,
        address: testAddress,
      })
      console.log("   ✓ Adresse:", address)
    } catch (err: any) {
      console.log("   ✗ Schreibtest fehlgeschlagen:", err.message)
    }
  } else {
    console.log("6) Schreibtest übersprungen (WRITE_TEST!=1)")
  }
}


main().catch((err) => {
  console.error("Fehlgeschlagen:", err.message)
  process.exit(1)
})
