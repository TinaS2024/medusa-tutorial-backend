/**
 * Typen für die GPE-Anbindung.
 *
 * Die Shapes sind bewusst locker gehalten (Index-Signaturen), weil GPE deutlich
 * mehr Felder liefert als wir hier deklarieren. Sobald du echte Antworten gesehen
 * hast, kannst du sie hier nachschärfen.
 */

/** Antwort des SpringAuthorizationServer. */
export type GpeToken = {
  access_token: string
  /** Ablaufzeitpunkt. Einheit laut Original-Server unklar – siehe RECIPE.md Teil 2. */
  exp: number
  [key: string]: unknown
}

/** Zugangsdaten, kommen aus den gpe_*-Umgebungsvariablen. */
export type GpeOptions = {
  server: string
  user: string
  password: string
  companyId: string
  host?: string
  port?: string
}

export type GpeAddress = {
  number: number
  [key: string]: unknown
}

/**
 * Normalisierte Adresse für den Schreibpfad Medusa→GPE. Klare Feldnamen –
 * das Mapping auf GPEs eigenwillige Namen (name=Vorname, fname=Nachname)
 * passiert intern im Client.
 */
export type GpeWriteAddress = {
  firstName: string
  lastName: string
  line1?: string
  line2?: string
  postalCode?: string
  city?: string
  /** Ländercode in GROSS, z. B. "DE". */
  country?: string
  email?: string
}

export type GpeCustomer = {
  id: string
  company?: string
  email?: string
  language?: string
  addresses?: GpeAddress[]
  /** Enthält u. a. designerDiscount – fließt in die Preisberechnung ein. */
  stringData?: {
    designerDiscount?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type GpeOptionValue = {
  id: string
  name?: string
  localizationKey?: string
  rgb?: string
  settings?: unknown
  [key: string]: unknown
}

export type GpeProductOption = {
  id: string
  name?: string
  localizationKey?: string
  defaultValue?: string
  fixedValue?: string
  settings?: unknown
  values?: GpeOptionValue[]
  [key: string]: unknown
}

export type GpeProductGroup = {
  name?: string
  description?: string
  settings?: unknown
  options?: GpeProductOption[]
  [key: string]: unknown
}

export type GpeProduct = {
  /** GPE-interner Surrogat-Key. Wandert nach Medusa als metadata.gpe_id. */
  id: number
  /** Artikelnummer, z. B. "4911". Das ist der fachliche Schlüssel. */
  name: string
  description?: string
  externalID?: string
  imageFileName?: string
  isActive?: boolean
  settings?: unknown
  options?: GpeProductOption[]
  fileNames?: { fileKey: string }[]
  ProductGroup?: GpeProductGroup
  [key: string]: unknown
}

/**
 * Antwort von ProductInfoJson – enthält Preis, gültige Optionen und
 * AdditionalFields für EINE konkrete Kombination.
 */
export type GpeProductInfo = {
    Product?: {
    settings?: {
      /** Stückpreis, dezimal (z.B. 10.11). Kann fehlen, wenn GPE nicht bepreisen kann. */
      price?: number
      currency?: string
      overallDiscount?: number
      textColor?: { name: string; rgb: string } | null
      backgroundColor?: { name: string; rgb: string } | null
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  options?: GpeProductOption[]
  additionalFields?: {
    fieldName: string
    fieldType: "integer" | "float" | "text" | string
    required?: boolean
    hideInDesigner?: boolean
    [key: string]: unknown
  }[]
  [key: string]: unknown
}

/** Argumente für einen Preis-/Kombinations-Aufruf. */
export type GetProductInfoArgs = {
  product: {
    gpe_id: number
    gpe_name: string
    externalID?: string
    description?: string
  }
  optionValues?: unknown[]
  additionalFieldValues?: unknown[]
  count?: number
  gpeCustomer?: GpeCustomer
  useDefaultOptionValues?: boolean
}
