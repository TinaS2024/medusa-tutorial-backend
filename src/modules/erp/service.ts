import { MedusaService } from "@medusajs/framework/utils"
import { GpeClient } from "./client/gpe-client"
import type {
  GetProductInfoArgs,
  GpeCustomer,
  GpeProduct,
  GpeProductInfo,
  GpeWriteAddress,
} from "./client/types"

/**
 * ERP-Modul-Service – die einzige Stelle, über die der Rest von Medusa GPE
 * anfasst. Alles darüber hinaus (Token, GraphQL-Eigenheiten, doppeltes
 * JSON.stringify) bleibt im Client gekapselt.
 *
 * Anders als bundled-product und order-production hat dieses Modul KEINE
 * Datenmodelle: Es besitzt keine Tabellen, es spricht nur mit einem fremden
 * System. Deshalb `MedusaService({})` ohne Argumente und keine Migrationen.
 */
export default class ErpModuleService extends MedusaService({}) {
  private client_: GpeClient | null = null

  /**
   * Client wird beim ersten Zugriff gebaut, nicht im Konstruktor. Damit
   * startet Medusa auch dann, wenn die gpe_*-Variablen fehlen – der Fehler
   * fällt erst beim tatsächlichen Aufruf, mit klarer Meldung.
   */
  private get client(): GpeClient {
    if (!this.client_) {
      this.client_ = new GpeClient({
        server: process.env.gpe_server as string,
        user: process.env.gpe_user as string,
        password: process.env.gpe_password as string,
        companyId: process.env.gpe_company_id as string,
        host: process.env.gpe_host,
        port: process.env.gpe_port,
      })
    }
    return this.client_
  }

  /** Ist GPE konfiguriert und erreichbar? */
  async isAvailable(): Promise<boolean> {
    try {
      return await this.client.ping()
    } catch {
      return false
    }
  }

  /**
   * Kunde aus GPE holen.
   * @param gpeCustomerId z. B. "10-000-001" – bei Medusa-Kunden aus
   *                      customer.metadata.gpe_id
   */
  async getCustomer(gpeCustomerId: string): Promise<GpeCustomer | null> {
    return this.client.getCustomer(gpeCustomerId)
  }

  /**
   * Produktstammdaten holen, gefiltert über Artikelnummern.
   * @param names z. B. ["4911", "4912"] – bei Medusa-Produkten aus
   *              product.metadata.gpe_name
   */
  async getProductsByNames(names: string[]): Promise<GpeProduct[]> {
    return this.client.getProductsByNames(names)
  }

  /**
   * Preis und Gültigkeit für eine konkrete Optionskombination.
   * Ergebnis niemals cachen – hängt an Kunde, Menge und Rabatt.
   */
    async getProductInfo(args: GetProductInfoArgs): Promise<GpeProductInfo | null> {
    return this.client.getProductInfo(args)
  }

  /**
   * Adresse an einen bestehenden GPE-Kunden anhängen (nicht überschreiben).
   * Der Kunde muss über customer.metadata.gpe_id verknüpft sein (Weg 1).
   */
  async addAddressToCustomerIfNotExists(args: {
    gpeCustomerId: string
    address: GpeWriteAddress
    locale?: string
  }) {
    return this.client.addAddressToCustomerIfNotExists(args)
  }

  /** Kontakt an einen bestehenden GPE-Kunden anhängen (nicht überschreiben). */
  async addContactToCustomerIfNotExists(args: {
    gpeCustomerId: string
    address: GpeWriteAddress
    locale?: string
  }) 
  {
    return this.client.addContactToCustomerIfNotExists(args);
  }
}
