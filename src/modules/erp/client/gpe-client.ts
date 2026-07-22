/**
 * GPE-Client – kapselt Token, Transport und die Eigenheiten der GPE-Server.
 *
 * Bewusst frei von Medusa: Diese Klasse ist reines HTTP und lässt sich mit einem
 * schlichten Node-Skript testen, ohne Medusa hochzufahren.
 *
 * Vertrag und Fallstricke: siehe ../RECIPE.md
 */

import type {
  GetProductInfoArgs,
  GpeAddress,
  GpeCustomer,
  GpeOptions,
  GpeProduct,
  GpeProductInfo,
  GpeToken,
  GpeWriteAddress,
} from "./types"

/** Token 60s vor Ablauf erneuern, damit kein Request in die Lücke fällt. */
const TOKEN_SKEW_MS = 60_000

/** Die drei GraphQL-Server von GPE. */
const GRAPHQL_SERVERS = {
  production: "ProductInfoServer",
  order: "OrderDatabaseServer",
  workflow: "Workflow",
} as const

type GraphQlServer = keyof typeof GRAPHQL_SERVERS

/**
 * GPE kennt keine GraphQL-Variablen. Komplexe Argumente müssen als
 * JSON-String-Literal in den Query-Text eingebettet werden: einmal stringify
 * für das Objekt selbst, einmal um daraus ein gültiges, korrekt escaptes
 * GraphQL-String-Literal zu machen.
 */
function gqlJsonArg(value: unknown): string {
  return JSON.stringify(JSON.stringify(value))
}

/**
 * String-Liste als GraphQL-Literal. JSON.stringify pro Wert statt roher
 * Interpolation – sonst zerlegt ein Anführungszeichen im Namen die Query.
 */
function gqlStringList(values: string[]): string {
  return `[${[...new Set(values)].map((v) => JSON.stringify(v)).join(",")}]`
}

export class GpeClient {
  
  private token: GpeToken | null = null
  /** Verhindert, dass parallele Requests gleichzeitig Token holen. */
  private tokenPromise: Promise<GpeToken> | null = null
  /** config.json-Discovery, einmal geholt und gecacht. */
  private baseUrls: Record<string, string> | null = null


  constructor(private readonly options: GpeOptions) {
    const missing = (["server", "user", "password", "companyId"] as const).filter(
      (k) => !options[k]
    )
    if (missing.length > 0) {
      throw new Error(
        `GpeClient: Konfiguration unvollständig, es fehlen: ${missing.join(", ")}. ` +
          `Erwartet werden die Umgebungsvariablen gpe_server, gpe_user, gpe_password, gpe_company_id.`
      )
    }
  }

  // ---------------------------------------------------------------- Token

  /**
   * GPE liefert `exp`, aber die Einheit ist nicht dokumentiert (RECIPE.md Teil 2).
   * Heuristik: Ein Epoch-Wert in Sekunden liegt aktuell bei ~1.7e9, in
   * Millisekunden bei ~1.7e12. Alles unter 1e12 ist also Sekunden.
   */
  private expiryMs(token: GpeToken): number {
    return token.exp < 1e12 ? token.exp * 1000 : token.exp
  }

  private isValid(token: GpeToken): boolean {
    return this.expiryMs(token) - TOKEN_SKEW_MS >= Date.now()
  }

  private async fetchToken(): Promise<GpeToken> {
    // URLSearchParams statt roher Interpolation: kodiert Sonderzeichen im
    // Passwort korrekt. Der Original-Server baut den Body von Hand und
    // zerbricht an einem "&" oder "+" im Passwort.
    const body = new URLSearchParams({
      username: this.options.user,
      password: this.options.password,
    }).toString()

    const res = await fetch(
      `https://${this.options.server}/SpringAuthorizationServer/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=utf8",
          "Company-ID": this.options.companyId,
        },
        body,
      }
    )

    const text = await res.text()
    if (!res.ok) {
      throw new Error(`GPE Token: HTTP ${res.status} – ${text.slice(0, 300)}`)
    }

    let parsed: GpeToken
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(`GPE Token: Antwort ist kein JSON – ${text.slice(0, 300)}`)
    }
    if (!parsed?.access_token) {
      throw new Error(`GPE Token: access_token fehlt in der Antwort`)
    }
    return parsed
  }

  private async getToken(): Promise<GpeToken> {
    if (this.token && this.isValid(this.token)) {
      return this.token
    }
    // Single-Flight: laufen zehn Requests gleichzeitig los, holt trotzdem nur
    // einer das Token.
    if (!this.tokenPromise) {
      this.tokenPromise = this.fetchToken()
        .then((t) => {
          this.token = t
          return t
        })
        .finally(() => {
          this.tokenPromise = null
        })
    }
    return this.tokenPromise
  }

  // ------------------------------------------------------------- Transport

  /**
   * Anders als im Original werden Fehler hier NICHT verschluckt. Der
   * Original-Server endet auf `.catch(r => console.log(r))` und gibt dann
   * undefined zurück – der Aufrufer bekommt einen TypeError statt einer
   * Fehlermeldung.
   */
  private async fetchWithToken(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken()
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token.access_token}`,
        "Company-ID": this.options.companyId,
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(
        `GPE ${init.method ?? "GET"} ${url} → HTTP ${res.status} – ${body.slice(0, 300)}`
      )
    }
    return res;
  }

  /**
   * Wie fetchWithToken, aber wirft NICHT bei non-ok – der Aufrufer liest den
   * Body selbst. Nötig für den ExactOnline-Connector, der Fehler teils inline
   * mit ###ERROR### im Body meldet (RECIPE 3b) statt über den HTTP-Status.
   */
  private async authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken()
    return fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token.access_token}`,
        "Company-ID": this.options.companyId,
      },
    })
  }

  /**
   * GraphQL-Query. Achtung: GPE erwartet Content-Type `application/graphql`
   * mit rohem Query-String als Body – NICHT das übliche {query, variables}-JSON.
   * Deshalb funktionieren Apollo & Co. hier nicht.
   *
   * @returns data, oder null wenn GPE `dataPresent: false` meldet.
   */
  private async graphqlQuery<T>(
    query: string,
    server: GraphQlServer = "production"
  ): Promise<T | null> {
    const url = `https://${this.options.server}/${GRAPHQL_SERVERS[server]}/webresources/graphql`

    const res = await this.fetchWithToken(url, {
      method: "POST",
      headers: { "Content-Type": "application/graphql" },
      body: query,
    })

    const json = (await res.json()) as {
      data?: unknown
      dataPresent?: boolean
      errors?: unknown[]
    }

    // Null-Guard: der Original-Server prüft an zwei Stellen `r.errors.length`
    // ohne zu prüfen ob `errors` überhaupt existiert – und crasht dann.
    if (Array.isArray(json?.errors) && json.errors.length > 0) 
    {
      throw new Error(`GPE GraphQL: ${JSON.stringify(json.errors).slice(0, 500)}`)
    }
    if (json?.dataPresent !== true || !json.data) 
    {
      return null
    }
    return json.data as T
  }

  // ---------------------------------------------------------------- Kunden

    /**
   * config.json-Discovery: GPE liefert unter /data/config.json die Basis-URLs
   * der Server – teils mit den Platzhaltern ${host}/${port}, die gegen
   * gpe_host/gpe_port ersetzt werden müssen. Einmal geholt und gecacht.
   * Vorbild: getBaseUrls in gpeHelper.js der Referenz.
   */
  private async resolveBaseUrls(): Promise<Record<string, string>> {
    if (this.baseUrls) {
      return this.baseUrls
    }

    const res = await this.fetchWithToken(
      `https://${this.options.server}/data/config.json`,
      { method: "GET" }
    )
    const config = (await res.json()) as { URI?: Record<string, string> }
    const uri = config?.URI
    if (!uri) {
      throw new Error("GPE config.json: Feld URI fehlt in der Antwort")
    }

    const replace = (value: string): string => {
      if (value.includes("${host}") && !this.options.host) {
        throw new Error("GPE config.json: ${host} nicht ersetzbar – gpe_host fehlt in der .env")
      }
      if (value.includes("${port}") && !this.options.port) {
        throw new Error("GPE config.json: ${port} nicht ersetzbar – gpe_port fehlt in der .env")
      }
      return value
        .replace(/\$\{host\}/g, this.options.host ?? "")
        .replace(/\$\{port\}/g, this.options.port ?? "")
    }

    const uriKeys: Record<string, string> = {
      PRODUCT: "productinfobaseuri",
      ORDER: "orderdatabaseuri",
      EXACTONLINE: "exactonlineconnectorbaseuri",
      LOCALIZATION: "localizationserverbaseuri",
    }
    const map: Record<string, string> = {}
    for (const [key, uriKey] of Object.entries(uriKeys)) {
      if (typeof uri[uriKey] === "string") {
        map[key] = replace(uri[uriKey])
      }
    }

    this.baseUrls = map
    return map
  }

  /**
   * Basis-URL des ExactOnline-Connectors – Grundlage für den Kunden-Schreibpfad
   * (Adresse/Kontakt anlegen). Löst bei Erstaufruf die config.json auf.
   */
  async getExactOnlineBaseUrl(): Promise<string> {
    const urls = await this.resolveBaseUrls()
    if (!urls.EXACTONLINE) {
      throw new Error("GPE config.json: exactonlineconnectorbaseuri fehlt")
    }
    return urls.EXACTONLINE
  }

  // -------------------------------------------------------------- Kunden

  /**
   * Kunde aus GPE lesen. REST, kein GraphQL.
   * @param gpeCustomerId formatierte GPE-ID, z. B. "10-000-001"
   */
  async getCustomer(gpeCustomerId: string): Promise<GpeCustomer | null> {
    if (!gpeCustomerId) {
      throw new Error("getCustomer: gpeCustomerId fehlt")
    }
    const res = await this.fetchWithToken(
      `https://${this.options.server}/CustomerDataServer/webresources/customers/filter`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: gpeCustomerId,
          searchButtonClicked: false,
          limit: 1,
          offset: 0,
        }),
      }
    )
       const data = (await res.json()) as { customers?: GpeCustomer[] }
    return data?.customers?.[0] ?? null
  }

  // -------------------------------------------------------- Kunden schreiben

  /**
   * Ganzes Kundenobjekt an GPE zurückschreiben. Vorbild: setGPECustomer.
   * Der ExactOnline-Connector antwortet mit text(), nicht JSON.
   */
  async updateCustomer(customer: GpeCustomer): Promise<string> {
    const base = await this.getExactOnlineBaseUrl()
    const res = await this.authedFetch(`${base}/customers/customer/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customer),
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`GPE updateCustomer → HTTP ${res.status} – ${text.slice(0, 300)}`)
    }
    return text
  }

  /**
   * Kontakt anlegen (roh). Antwort ist text(); im – nicht immer fatalen –
   * Fehlerfall mit Magic-Prefix ###ERROR### gefolgt von JSON, das den Kontakt
   * trotzdem enthält (RECIPE 3b). Deshalb wird ###ERROR### VOR dem Status
   * geprüft.
   */
  private async addContactRaw(
    gpeCustomerId: string,
    contact: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    const base = await this.getExactOnlineBaseUrl()
    const res = await this.authedFetch(
      `${base}/customers/customer/${encodeURIComponent(gpeCustomerId)}/update/newcontact`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      }
    )
    const text = await res.text()
    const ERROR_PREFIX = "###ERROR###"
    if (text.startsWith(ERROR_PREFIX)) {
      const parsed = JSON.parse(text.slice(ERROR_PREFIX.length))
      return parsed?.newContact ?? null
    }
    if (!res.ok) {
      throw new Error(`GPE addContact → HTTP ${res.status} – ${text.slice(0, 300)}`)
    }
    return text ? JSON.parse(text) : null
  }

  /**
   * Adresse anhängen, WENN sie in GPE nicht schon existiert. Nicht
   * überschreibend: Kunde laden → auf gleichartige Adresse prüfen → bei Bedarf
   * anhängen und das ganze Objekt zurückschreiben → neu laden, um die von GPE
   * vergebene Adress-`number` zu finden. Vorbild: addAddressToCustomerIfNotExists.
   */
  async addAddressToCustomerIfNotExists(args: {
    gpeCustomerId: string
    address: GpeWriteAddress
    locale?: string
  }): Promise<GpeAddress | null> {
    const { gpeCustomerId, address, locale = "de" } = args
    if (!address.firstName || !address.lastName) {
      throw new Error("addAddressToCustomerIfNotExists: firstName/lastName fehlen")
    }

    const customer = await this.getCustomer(gpeCustomerId)
    if (!customer) {
      throw new Error(`GPE-Kunde ${gpeCustomerId} nicht gefunden`)
    }

    const existing = customer.addresses ?? []
    const entry = buildGpeAddressEntry(address, locale)

    const found = existing.find((a) => addressesProbablyEqual(a, entry))
    if (found) {
      return found
    }

    const beforeNumbers = existing.map((a) => a.number)
    await this.updateCustomer({
      ...customer,
      addresses: [...existing, entry as unknown as GpeAddress],
    })

    const reloaded = await this.getCustomer(gpeCustomerId)
    const added = reloaded?.addresses?.find((a) => !beforeNumbers.includes(a.number))
    return added ?? null
  }

  /**
   * Kontakt anhängen, WENN er in GPE nicht schon existiert.
   * Vorbild: addContactToCustomerIfNotExists.
   */
  async addContactToCustomerIfNotExists(args: {
    gpeCustomerId: string
    address: GpeWriteAddress
    locale?: string
  }): Promise<Record<string, unknown> | null> {
    const { gpeCustomerId, address, locale = "de" } = args
    if (!address.firstName || !address.lastName) {
      throw new Error("addContactToCustomerIfNotExists: firstName/lastName fehlen")
    }

    const customer = await this.getCustomer(gpeCustomerId)
    if (!customer) {
      throw new Error(`GPE-Kunde ${gpeCustomerId} nicht gefunden`)
    }

    const contacts = ((customer as any).contacts ?? []) as Record<string, unknown>[]
    const entry = buildGpeContactEntry(address, locale)

    const found = contacts.find((c) => contactsProbablyEqual(c, entry))
    if (found) {
      return found
    }
    return this.addContactRaw(gpeCustomerId, entry)
  }

  // -------------------------------------------------------------- Produkte


  /**
   * Produktstammdaten lesen. Gefiltert wird über die Artikelnummer (`names`),
   * nicht über die GPE-id.
   */
  async getProductsByNames(names: string[]): Promise<GpeProduct[]> {
    if (!names || names.length === 0) {
      return []
    }
    const query = `{
      Products(isActive: true, names: ${gqlStringList(names)}) {
        id imageFileName name description externalID settings isActive
        options {
          id name localizationKey defaultValue fixedValue settings
          values { id name localizationKey rgb settings }
        }
        ProductGroup {
          name description settings
          options { id defaultValue values { id name rgb } }
        }
      }
    }`
    const data = await this.graphqlQuery<{ Products: GpeProduct[] }>(query)
    return data?.Products ?? []
  }

  /**
   * Preis + gültige Optionen + AdditionalFields für EINE Kombination.
   *
   * Das ist der dynamische Teil: Das Ergebnis hängt an Produkt, Optionen,
   * Menge, Kunde und Rabatt und darf NICHT gecacht werden.
   */
  async getProductInfo(args: GetProductInfoArgs): Promise<GpeProductInfo | null> {
    const {
      product,
      optionValues,
      additionalFieldValues,
      count = 1,
      gpeCustomer,
      useDefaultOptionValues = false,
    } = args

    const positionSettings: Record<string, unknown> = {
      product: {
        name: product.gpe_name,
        id: product.gpe_id,
        externalID: product.externalID,
        description: product.description,
        displayedDescription: product.description,
      },
      optionValues,
      additionalFieldValues,
      count,
      processingDays: 1,
    }

    const discount = gpeCustomer?.stringData?.designerDiscount
    if (discount !== undefined) {
      positionSettings.finalDiscount = discount
    }

    const query = `{
      ProductInfoJson(
        useDefaultOptionValues: ${useDefaultOptionValues}
        positionSettings: ${gqlJsonArg(positionSettings)}
        customerInfo: ${gqlJsonArg(gpeCustomer ?? {})}
      )
    }`

    const data = await this.graphqlQuery<{ ProductInfoJson: GpeProductInfo }>(query)
    return data?.ProductInfoJson ?? null
  }

    /** Erreichbarkeitstest – holt nur ein Token. */
  async ping(): Promise<boolean> {
    try {
      await this.getToken()
      return true
    } catch {
      return false
    }
  }
}

// ------------------------------------------------------- Mapping-Helfer (GPE)

/**
 * GPE-Adressdatensatz. GPE benennt Vor-/Nachname verwirrend (name=Vorname,
 * fname=Nachname) – hier klar. type "4" = Lieferadresse. `state`/Bundesland
 * bewusst (noch) nicht gesetzt – erst nach Klärung des GPE-Feldnamens.
 */
function buildGpeAddressEntry(a: GpeWriteAddress, locale: string) {
  return {
    addressee: `${a.firstName} ${a.lastName}`,
    type: "4",
    line1: a.line1,
    line2: a.line2,
    postalCode: a.postalCode,
    city: a.city,
    country: a.country,
    email: a.email,
    language: locale,
    isDefault: false,
    internal: false,
    comment: "created with medusa",
  }
}

function buildGpeContactEntry(a: GpeWriteAddress, locale: string) {
  return {
    lastName: a.lastName,
    firstName: a.firstName,
    email: a.email,
    language: locale,
    comment: "created with medusa",
    type: "Contact",
    isDefault: false,
  }
}

/** Unscharfer Adressvergleich – 1:1 aus der Referenz (AddressesProbablyEqual). */
function addressesProbablyEqual(a: any, b: any): boolean {
  return (
    a?.type === b.type &&
    a?.line1 === b.line1 &&
    a?.line2 === b.line2 &&
    a?.postalCode === b.postalCode &&
    a?.email === b.email &&
    a?.country === b.country &&
    a?.addressee === b.addressee
  )
}

/** Unscharfer Kontaktvergleich – 1:1 aus der Referenz (ContactProbablyEqual). */
function contactsProbablyEqual(a: any, b: any): boolean {
  return (
    a?.lastName === b.lastName &&
    a?.firstName === b.firstName &&
    a?.email === b.email &&
    a?.type === b.type &&
    a?.language === b.language
  )
}
