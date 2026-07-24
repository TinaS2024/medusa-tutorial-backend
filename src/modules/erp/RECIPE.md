# Rezept: GPE-Anbindung als Medusa-Modul

Abgeleitet aus der produktiven Implementierung in `entwicklung/server-stempel-editor`
(`src/services/gpe/*`, `src/services/updateProductsWithGPE.js`).

Teil 1–3 sind **verifizierter Vertrag** (aus dem laufenden Code gelesen).
Teil 4–5 sind **Vorschlag** (Design-Entscheidungen, die noch zu treffen sind).

---

## 1. Was GPE technisch ist

Kein einzelner Dienst, sondern mehrere Java-/Spring-Server hinter einem Host:

| Server | Zweck | Protokoll |
|---|---|---|
| `SpringAuthorizationServer` | Token-Ausgabe | REST, form-encoded |
| `CustomerDataServer` | Kunden lesen | REST, JSON |
| `ProductInfoServer` | Produkte, Optionen, Preise | GraphQL |
| `OrderDatabaseServer` | Bestellungen | GraphQL |
| `Workflow` | Prozessversionen | GraphQL |
| ExactOnline-Connector | Kunden schreiben | REST, JSON |

Basis-URL immer `https://${gpe_server}/<Server>/webresources/...`.

### Benötigte Umgebungsvariablen

Aus `server-stempel-editor/.env.default` — dieselben Namen übernehmen:

```
gpe_server        # Host für Auth + direkte Server-Aufrufe
gpe_host          # Platzhalter-Ersetzung in config.json
gpe_port          # Platzhalter-Ersetzung in config.json
gpe_user
gpe_password
gpe_company_id    # geht als Header bei JEDEM Request mit
gpe_test_mode
gpe_test_customer_id
```

### Service-Discovery

```
GET https://${gpe_server}/data/config.json
```

Liefert `config.URI.*` mit den Schlüsseln `productinfobaseuri`, `orderdatabaseuri`,
`exactonlineconnectorbaseuri`, `localizationserverbaseuri`, `tempstoragebaseuri`.
Die enthalten die Literale `${host}` und `${port}`, die gegen `gpe_host`/`gpe_port`
ersetzt werden müssen. `tempstoragebaseuri` bekommt zusätzlich `/company/${gpe_company_id}`
angehängt.

Der Server macht das beim Start einmal (`initGPE`) und cached es in `gpeConstants`.
Schlägt es fehl, wird `status = 'FAILED'` gesetzt und **alle 5 Minuten neu versucht** —
die App startet also auch ohne GPE. Dieses Verhalten unbedingt übernehmen: GPE darf
den Medusa-Start nicht blockieren.

---

## 2. Authentifizierung

```http
POST https://${gpe_server}/SpringAuthorizationServer/token
Content-Type: application/x-www-form-urlencoded; charset=utf8
Company-ID: ${gpe_company_id}

username=${gpe_user}&password=${gpe_password}
```

Antwort: `{ access_token, exp, ... }`

Danach an **jedem** Request:

```http
Authorization: Bearer <access_token>
Company-ID: ${gpe_company_id}
```

Token-Cache-Regel aus `gpeHelper.js`:

```js
accessTokenObject.exp - 60 * 1000 >= Math.floor(Date.now())
```

> ⚠️ `exp` wird hier gegen Millisekunden verglichen, nicht gegen Sekunden wie bei
> JWT üblich. Vor Übernahme einmal prüfen, was GPE tatsächlich liefert — wenn `exp`
> in Sekunden kommt, ist der Cache faktisch immer kalt und du holst bei jedem
> Request ein neues Token.

---

## 3. Die Endpunkte, die du brauchst

### 3a. Kunde lesen — REST, nicht GraphQL

```http
POST https://${gpe_server}/CustomerDataServer/webresources/customers/filter
Content-Type: application/json

{ "id": "<gpeCustomerID>", "searchButtonClicked": false, "limit": 1, "offset": 0 }
```

Antwort: `{ customers: [ ... ] }` → `customers[0]` nehmen, leeres Array = nicht gefunden.

GPE-Kunden-IDs sind formatiert: `10-000-001`. Das Feld `stringData.designerDiscount`
trägt einen kundenspezifischen Rabatt, der später in die Preisberechnung fließt.
Adressen hängen als `addresses[]` mit je einer `number` am Kunden.

### 3b. Kunde schreiben (falls später nötig)

```http
POST ${baseURLs.EXACTONLINE}/customers/customer/update
POST ${baseURLs.EXACTONLINE}/customers/customer/${gpeCustomerID}/update/newcontact
```

> ⚠️ `newcontact` antwortet mit `text()`, nicht JSON — und im Fehlerfall mit dem
> Magic-Prefix `###ERROR###` gefolgt von JSON. Siehe `getGPECustomer.js`.

### 3c. Produkte lesen — GraphQL

```http
POST https://${gpe_server}/ProductInfoServer/webresources/graphql
Content-Type: application/graphql
Authorization: Bearer <token>
Company-ID: ${gpe_company_id}

<roher Query-String als Body>
```

Query (aus `getProductsByNames`):

```graphql
{
  Products(isActive: true, names: ["4911", "..."]) {
    id imageFileName name description externalID settings isActive
    options {
      id name localizationKey defaultValue fixedValue settings
      values { id name localizationKey rgb settings }
    }
    fileNames { fileKey }
    ProductGroup {
      name description settings
      options { id defaultValue values { id name rgb } }
    }
  }
}
```

**Wichtig:** Produkte werden über `names` abgefragt, nicht über `id`. Der fachliche
Schlüssel ist also die Artikelnummer (`"4911"`), `id` ist der GPE-interne Surrogat-Key.
Beides brauchst du (siehe Teil 4).

### 3d. Preis + gültige Kombination — der dynamische Teil

```graphql
{
  ProductInfoJson(
    useDefaultOptionValues: false
    positionSettings: "<doppelt stringifiziertes JSON>"
    customerInfo: "<doppelt stringifiziertes JSON>"
  )
}
```

`positionSettings`:

```json
{
  "product": { "name": "...", "id": <gpe_id>, "externalID": "...",
               "description": "...", "displayedDescription": "..." },
  "optionValues": [...],
  "additionalFieldValues": [...],
  "count": 1,
  "processingDays": 1,
  "finalDiscount": "<nur wenn customerInfo.stringData.designerDiscount gesetzt>"
}
```

Plural-Variante `ProductInfoJsons` nimmt ein Array von `positionSettings` — für
Warenkorb-Preise in einem Rutsch.

Das ist der Kern: **Preis, gültige Optionen und AdditionalFields sind eine Funktion
von (Produkt × Optionen × Menge × Kunde × Rabatt)** und werden bei jedem Aufruf neu
von GPE berechnet. Sie sind nicht spiegelbar.

### 3e. Antwort-Envelope

GPE antwortet **nicht** standard-GraphQL. Guard immer so:

```js
if (r && r.dataPresent === true && Array.isArray(r.data.Products)) { ... }
```

Mutations gehen an eine **andere URL** (`/webresources/graphql/mutation`) und werden
mit `.text()` gelesen, nicht `.json()`.

---

## 4. Fallstricke — bitte nicht mitkopieren

Diese Punkte sind im Original-Server real vorhanden. Beim Nachbau bewusst besser machen:

1. **Kein Standard-GraphQL-Client möglich.** `Content-Type: application/graphql` mit
   rohem Body. Apollo und `graphql-request` senden `{query, variables}` als JSON und
   scheitern hier. Nimm `fetch` direkt.

2. **Keine GraphQL-Variablen — alles String-Interpolation.**
   `positionSettings: ${JSON.stringify(JSON.stringify(obj))}` baut ein JSON-String-Literal
   in den Query-Text. Das ist injection-anfällig und bricht bei Sonderzeichen. Da GPE
   keine Variablen anzubieten scheint, mindestens die Serialisierung zentral kapseln
   statt an sechs Stellen zu wiederholen.

3. **Fehler werden verschluckt.** `fetchWithToken` endet auf `.catch(r => console.log(r))`
   und gibt dann `undefined` zurück — der Aufrufer macht `response.json()` darauf und
   bekommt einen TypeError statt einer brauchbaren Fehlermeldung. **Nicht übernehmen.**

4. **`r.errors.length` ohne Null-Guard.** In `getInfluencingOptions` und
   `getProductsByNames` steht `if (r.errors.length > 0)`, in
   `getProductSettingsByProducts` dagegen korrekt `if (r.errors && ...)`. Die ersten
   beiden crashen, wenn GPE kein `errors`-Feld liefert.

5. **Token-Cache ist ein Modul-Singleton.** `accessTokenObject` liegt global, nicht pro
   Company. Der Rossini-Server umgeht das, indem pro Mandant ein eigener Prozess auf
   eigenem Port läuft (das ist der `companyport` im Frontend). Wenn dein Medusa-Backend
   mehrere Mandanten in einem Prozess bedienen soll, brauchst du den Cache **pro
   `company_id`** — sonst bekommt Mandant B das Token von Mandant A.

---

## 5. Vorschlag: Schnitt für Medusa

### 5a. Spiegeln vs. live abfragen

Rossini hat diese Frage schon beantwortet, und die Antwort trägt auch für Medusa:

| Daten | Strategie | GPE-Quelle |
|---|---|---|
| Produktstammdaten, Optionen-Katalog, ProductGroup, Bilder | **spiegeln**, Pull per Job/Button | `Products(names:[...])` |
| Kundenstammdaten, Adressen | **spiegeln**, Pull bei Bedarf | `customers/filter` |
| Preis, gültige Kombination, AdditionalFields | **live**, nie cachen | `ProductInfoJson` |

### 5b. Der Anker: `gpe_id` UND Artikelnummer

Deine Manifeste in `gpe-outbox/` tragen bisher nur Medusa-ULIDs. Es braucht beide
GPE-Schlüssel, weil GPE selbst beide benutzt:

```ts
// Product.metadata
{ gpe_id: 9806, gpe_name: "4911", gpe_external_id: "..." }

// Customer.metadata
{ gpe_id: "10-000-001", gpe_shop_address_number: 333477 }
```

Sync läuft über `gpe_name` (Artikelnummer), da `Products(names:[...])` danach filtert.

### 5c. Die Kernentscheidung: Optionen ≠ Varianten

Das ist der Punkt, an dem das Design steht oder fällt.

Medusa modelliert Varianten **statisch** (Produkt → Varianten mit fixen Preisen).
GPE liefert **keine Variantenliste**, sondern eine Preis- und Gültigkeitsfunktion.
Die Optionen aus `Products.options` sind nur der *Katalog* — welche Kombination gültig
ist und was sie kostet, weiß nur `ProductInfoJson`.

**Nicht tun:** das Kreuzprodukt aller Optionen als Medusa-Varianten materialisieren.
Es explodiert kombinatorisch, und der Preis hinge trotzdem noch an Kunde und Menge —
du müsstest ihn also *doch* live holen.

**Stattdessen:** eine konfigurierbare Variante pro Produkt, Preis live auflösen.
Und dafür hast du die Infrastruktur schon:

- `src/workflows/get-custom-price.tsx` + `src/workflows/steps/get-custom-price.tsx`
- `src/api/admin/products/[id]/personalization-price`
- `src/api/store/carts/[id]/line-items-custom`
- `src/workflows/hooks/validate-personalized-product.ts`

Der GPE-Aufruf gehört genau dort hinein: `get-custom-price` ruft statt der lokalen
Berechnung `erpService.getProductInfo({ product, optionValues, count, gpeCustomer })`
auf und übernimmt Preis + Gültigkeit aus der Antwort. `validate-personalized-product`
wird zum Ort, an dem eine von GPE abgelehnte Kombination auffliegt.

### 5d. Modul-Aufbau

Passend zu deinem `bundled-product`-Muster (Medusa v2.13):

```
src/modules/erp/
├── index.ts              # Module("erp", { service: ErpModuleService })
├── service.ts            # ErpModuleService – fachliche Methoden
├── client/
│   ├── gpe-client.ts     # Token-Cache, fetchWithToken, GraphQL-Transport
│   └── config.ts         # config.json-Discovery + Platzhalter-Ersetzung
└── RECIPE.md             # dieses Dokument
```

`service.ts` bietet fachlich an — und **nur** das, damit GPE-Eigenheiten nicht nach
außen lecken:

```ts
getCustomer(gpeCustomerId: string): Promise<GpeCustomer | null>
getProductsByNames(names: string[]): Promise<GpeProduct[]>
getProductInfo(args: {
  product: { gpe_id: number; gpe_name: string; externalID?: string }
  optionValues?: unknown[]
  additionalFieldValues?: unknown[]
  count?: number
  gpeCustomer?: GpeCustomer
}): Promise<GpeProductInfo | null>
isAvailable(): boolean     // gpeConstants.status === 'OKAY'
```

### 5e. Reihenfolge der Umsetzung

1. `gpe-client.ts` — Token + Discovery + GraphQL-Transport. Isoliert testbar gegen
   `gpe_test_mode` / `gpe_test_customer_id`.
2. `getCustomer` — kleinster Durchstich, reines REST, sofort verifizierbar.
3. ✓ **ERLEDIGT:** `getProductsByNames` + Sync (Admin-Route
   `POST /admin/erp/products/sync` UND wöchentlicher Scheduled Job) →
   Medusa-Produkte mit `gpe_id`-Metadaten + GPE-Basispreis. Vorbild:
   `product/refetch` im Rossini-Backend.
4. `getProductInfo` in `get-custom-price` einhängen. **Hier wird es weh tun** — Zeit einplanen.
5. Erst danach das Outbox-Manifest (`order-placed-gpe.ts`) um `gpe_id` erweitern und
   auf echten GPE-Versand umstellen (`OrderDatabaseServer`, siehe `sendOrderToGPE.js`
   und `startOrderGPESender.js`).

---

## 6. Stand der Umsetzung (20.07.2026)

**Fertig und verifiziert:**

- ERP-Modul (`index.ts`, `service.ts`, `client/gpe-client.ts`, `client/types.ts`),
  registriert in `medusa-config.ts`.
- Testroute `GET /admin/erp/customer/:gpeId` — liefert korrekt 502 samt Klartext,
  solange die `gpe_*`-Variablen leer sind.
- Preis-Verzweigung in `workflows/steps/get-custom-price.tsx`: Bei gesetzter
  `product.metadata.gpe_id` entscheidet GPE, sonst greift unverändert die alte
  Flächenformel.
- `quantity` und `customer_id` fließen jetzt bis in den Step durch
  (`get-custom-price.tsx`, `custom-add-to-cart.tsx`, `variants/[id]/price/route.ts`).
- Lokale `max_*`-Prüfung wird für GPE-Produkte übersprungen
  (`hooks/validate-personalized-product.ts`).
- Verifiziert: `npx tsc --noEmit` sauber; Bestandsprodukt (Alu-Schild, kein `gpe_id`)
  im Warenkorb unverändert bepreist.

- **Produkt-Sync als wöchentlicher Scheduled Job (21.07.2026):** Kernlogik in
  `src/lib/sync-gpe-products.ts` (`runProductSync`), geteilt von der Admin-Route
  `POST /admin/erp/products/sync` und dem Job `src/jobs/sync-gpe-products.ts`
  (Cron `0 3 * * 1` = Montag 03:00, Pull GPE→Medusa). Der Job schluckt GPE-Fehler
  bewusst (Log statt Crash, damit ein GPE-Ausfall keinen roten „Scheduled job
  failed" erzeugt). Verifiziert: Job feuert und läuft durch ("[gpe-sync] fertig:
  1 Produkt aktualisiert, 1 Variantenpreis gesetzt, 0 nicht gefunden"), `tsc` sauber.


**Zugangsdaten liegen vor und funktionieren** (16.07.2026): Eigene Kennung
`gpe_user=medusa`, `gpe_company_id=999`, extra für den Medusa-Shop angelegt —
die `designer`-Kennung des Stempel-Editors wird NICHT mitbenutzt. Der
Token-Request liefert HTTP 200. Wichtig: `gpe_server` muss den Port
enthalten (`bolasys.selfhost.eu:8443`), da der Client die URLs als
`https://${gpe_server}/...` baut und den Port nirgends separat anhängt.
Ohne Port geht der Request auf 443, wo GPE nicht antwortet.

**TLS:** GELÖST (siehe 6c). Interne CA über `NODE_EXTRA_CA_CERTS` in den
`dev`/`start`-Skripten (via `cross-env`); die Zertifikatsprüfung bleibt für
den ganzen Prozess aktiv. `npm run dev` lädt die CA automatisch.

**Preispfad steht — end-to-end verifiziert (16.07.2026):** `extractPrice()`
liest `Product.settings.price` (dezimal), bestätigt an der echten
ProductInfoJson-Antwort für 4911 → 10,11 €. Verifiziert auf drei Ebenen:
isolierter Smoke-Test, echter `getCustomPriceWorkflow` gegen eine Variante,
und die HTTP-Route `POST /store/variants/:id/price` — alle drei liefern
denselben Preis inkl. Staffelrabatt (Menge 1/5/10 → 10,11 / 9,10 / 8,59 €).
`extractPrice()` wirft sauber, wenn GPE keinen Preis liefert (kein NaN).

Testprodukt in Medusa: „Trodat 4911", `metadata` = `is_personalized`,
`gpe_id=9806`, `gpe_name=4911`, `gpe_external_id=5a6a…27a4`.

### 6a. GELÖST (21.07.2026): Preisvorschau mit Kundenrabatt

`POST /store/variants/:id/price` übergibt **kein** `customer_id`. Den angemeldeten
Kunden müsste man aus dem Auth-Kontext ziehen (`req.auth_context`), was noch nicht
verifiziert ist. Folge: Bei GPE-Produkten zeigt die Vorschau den Preis **ohne**
Kundenrabatt, im Warenkorb (`custom-add-to-cart`, holt `customer_id` aus dem Cart)
wird er dann angewandt. Für Kunden mit `designerDiscount` weicht die Vorschau also
vom Warenkorbpreis ab. Vor dem Livegang schließen.


> **GELÖST 21.07.2026:** Die Route zieht `customer_id` jetzt aus
> `req.auth_context.actor_id` (dazu `authenticate("customer", …,
> { allowUnauthenticated: true })` in `api/middlewares.ts`). Verifiziert:
> angemeldeter Rabattkunde sieht den rabattierten Preis schon in der Vorschau,
> Gast (kein auth_context) sieht den Basispreis. Vorschau = Warenkorbpreis.

### 6b. Falle: zod verwirft unbekannte Metadaten

Das Schema in `variants/[id]/price/route.ts` listet die erlaubten `metadata`-Felder
einzeln auf. Ohne expliziten Eintrag verwirft zod sie **stillschweigend** — deshalb
stehen `gpe_option_values` und `gpe_additional_fields` dort jetzt drin. Wer später
weitere GPE-Felder durchreichen will, muss sie hier ergänzen, sonst kommen sie nie
im Step an.

### 6c. Offen: TLS-Zertifikat vor dem Livegang klären

> **GELÖST 17.07.2026:** Die Fachseite hat die interne CA geliefert
> (`cylas_cacert.pem`, jetzt `medusa-backend/certs/gpe-ca.pem`). Sie ist die
> Root-CA (`CA:true`), die das GPE-Serverzertifikat signiert; damit verifiziert
> Node die GPE-Kette bei **aktiver** Prüfung (`authorized: true`, empirisch).
> Umgesetzt über `NODE_EXTRA_CA_CERTS` in den `dev`/`start`-Skripten (via
> `cross-env`). `NODE_TLS_REJECT_UNAUTHORIZED=0` wird NICHT mehr gebraucht –
> die Zertifikatsprüfung bleibt für den ganzen Prozess (auch Zahlung, SMTP) an.
> Wichtig: `NODE_EXTRA_CA_CERTS` gehört NICHT in die `.env` – Node liest die
> Variable beim Bootstrap, bevor dotenv läuft. Sie muss echte Prozess-Umgebung
> sein, daher `cross-env` im npm-Skript. Der Rest dieses Abschnitts ist damit
> historisch.

**Historisch (vor der CA-Lösung):** Lokale Tests liefen über die Ausnahme
`NODE_TLS_REJECT_UNAUTHORIZED=0`, pro Konsole vor dem Start gesetzt. 
Seit der
CA-Lösung (6c) nicht mehr nötig.

### 6d. Flächenpreis: area-Option, nicht useDefaultOptionValues (16.07.2026)

Der Step nutzt "useDefaultOptionValues: false" — das ist korrekt und entspricht
dem echten Warenkorb-Pfad der Referenz (`getProductSettingsForPosition` in
"updateProductsWithGPE.js:186", ebenfalls `false` + explizite optionValues).

**Der Flächenpreis hängt NICHT am false/true-Schalter, sondern an einer Option.**
4911 hat eine Option `area` (id 10, `required`, `defaultValue: 28`); ihr Wert 28
trägt `pricePerArea` und die additionalFields width/height. Empirisch (4911):

| optionValues | 5×3 cm |
|---|---|
| leer | 10,11 € (Fläche ignoriert) |
| `[{option:"10",value:"28",componentSettingsPath:[]}]` | 11,61 € (Fläche gerechnet) |

Shape einer optionValue: `{ option: <optionId>, value: <valueId>, componentSettingsPath: [] }`
— Options-ID und Wert-**ID**, nicht der Name (`value:"ja"` wird ignoriert).

**Fachliche Einordnung (17.07.2026):** GPE führt derzeit ausschließlich Stempel,
keine Schilder. Damit tritt der GPE-Flächenpreis (area-Option) in der Praxis
nicht auf — Stempel sind fest bepreist. Schilder laufen im Shop über die
**lokale** Flächenformel (Produkte ohne `gpe_id`, siehe die Verzweigung in
`get-custom-price.tsx`). Der aktuelle Datenstand spiegelt das bereits: nur der
Stempel „Trodat 4911" trägt `gpe_id`, die Alu-Schilder nicht. Die area-Option-
Mechanik ist verstanden und dokumentiert, ruht aber, bis GPE selbst ein
flächenbepreistes Produkt anbietet.


### 6e. Kundenrabatt: Mechanik bestätigt, echter Kunde fehlt (20.07.2026)

Die Rabatt-Mechanik ist verifiziert — mit einem synthetischen Kunden, weil
der einzige Testkunde `10-004-444` keinen Rabatt trägt (`stringData` ist leer,
kein rabattähnliches Feld im ganzen Datensatz).

Testkunden mit Rabatt (gefunden 20.07.2026): 10-000-393 (6 %) und
10-000-943 (10 %). Für einen Live-Test einen Medusa-Kunden per
metadata.gpe_id darauf zeigen lassen.


Der Client baut `positionSettings.finalDiscount` + `customerInfo` korrekt
(`gpe-client.ts:286`); GPE rechnet es als `overallDiscount` in den Preis ein.
Empirisch am 4911 (Basis 10,11 €):

| `designerDiscount` | Preis |
|---|---|
| — | 10,11 € |
| 0.1 | 9,10 € |
| 0.2 | 8,09 € |
| 0.25 | 7,58 € |

**Format:** `designerDiscount` ist ein **Bruch** (`0.1` = 10 %), kein Prozentwert.

**Live bestätigt (20.07.2026):** Medusa-Kunde auf `10-000-943` gezeigt →
Warenkorb 8,01 € statt 10,11 (GPE stapelt designerDiscount 0,1 + generellen
discount 0,12). Der komplette Pfad (`resolveGpeCustomer` in
`get-custom-price.tsx`) läuft. Details in 6g.

**Rabatte stapeln — geklärt (24.07.2026): gewollt.** Der GPE-`designerDiscount`
ist ein **Designer-Rabatt** (fürs Gestalten über den Designer), kein
Produkt-Rabatt. Medusa nutzt jetzt einen eigenen, funktional gleichwertigen
Designer. Eine Medusa-Promotion/Preisliste ist eine **andere** Rabatt-Art
(Produkt/Marketing) — beide dürfen **stapeln**, kein doppelter Rabatt derselben
Art. Aktuelles Verhalten (GPE liefert den designer-rabattierten Stückpreis,
Medusa-Promotion greift im Warenkorb zusätzlich) ist damit korrekt; keine
Codeänderung nötig.

### 6f. Analyse: echter GPE-Bestellversand (OrderDatabaseServer) — 20.07.2026

Status: **analysiert, nicht implementiert.** Bewusst optional/zuschaltbar, weil
das Template auch an ein anderes GPE (oder keins) gebunden werden kann.

**Ablauf in der Referenz** (mehrstufig, zustandsbehaftet):
1. `mutation { newOrderProcessID }` → orderProcessID (Handle).
2. Design-Dateien pro Position als multipart an
   `/OrderDatabaseServer/webresources/orderprocess/${orderProcessID}/image`
   (Antwort: text()). Vor der Bestellung.
3. Payload bauen (siehe `orderPayload.js`): customer=gpe_id, settings
   (Liefer-/Rechnungsadresse, Kontakte, Workflows, Zahlung, Versandart, Preis),
   positions[] (Produkt, Optionen, Preis+VAT, itemWorkflow, Versanddaten) plus
   eine Versandkosten-Position mit Artikel "99000" (in Company 999 = id 2041,
   "Versandkosten", Preis 0 → pro Bestellung mit echtem Betrag).
4. `mutation { newOrder(orderProcessID, data: <doppelt stringifiziert>) {id uri}}`
   an den order-Server → GPE-Order-ID.
5. Proof abwarten über WebSocket `wss://${gpe_server}/Workflow/graphqlsubscriptions`
   (QuotationProof finished/failed). **Laut Fachseite Pflicht**, sobald Medusa an
   ein ERP hängt.
6. Retry: Job sucht Bestellungen ohne GPE-Order-ID und sendet erneut.

**Vorgeschlagene Architektur (optional):**
- Das Outbox-Manifest bleibt der neutrale Vertrag; der Versand ist ein
  Verbraucher davon, keine Änderung am Manifest.
- Zuschaltbar über Env-Flag (z.B. GPE_ORDER_SUBMIT=true). Ohne Flag nur Outbox.
- Neue Kapselung erpService.submitOrder(...) für die 4-Stufen-Sequenz; alle
  GPE-Eigenheiten bleiben im ERP-Modul.
- GPE-Order-ID zurück nach order.metadata.gpe_order_id — zugleich Idempotenz-
  Marke (gesetzt = versandt).
- Retry als Medusa-Job statt setInterval.

**Geklärt (20.07.2026):** Preis rechnet GPE selbst (Medusa muss den Preis-Block
vermutlich nicht voll liefern — Minimalfelder noch zu bestätigen). Proof ist
Pflicht. "99000" existiert und trägt die Versandkosten.

**Fachseite-Antworten (20.07.2026) — die Blocker sind damit weitgehend geklärt:**
- **Kunden-Modell = Variante A:** Medusa-Kunden werden in GPE angelegt (Push
  Medusa→GPE, noch zu bauen). Felder: company, email, phone + Adresse
  (Straße+Hausnummer→line1, Zusatz→line2, postalCode, city, country [GROSS],
  Bundesland→state). Vorbild: addAddressToCustomerIfNotExists /
  addContactToCustomerIfNotExists (mit ###ERROR###-Fallstrick aus 3b). Der
  frühere Blocker „Schreibpfad" ist damit entschieden.
- **Preisblock nicht nötig** — GPE rechnet den Preis selbst.
- **Versandkosten GPE-seitig** — GPE kann eigene Versandpreise festlegen/nutzen.
- **Daten-Sync wöchentlich** — Produkt-Sync als geplanter Job 1×/Woche (Pull).
- **Proof/Versandformat OFFEN:** Chefin vergleicht die Outbox-JSON mit einer
  GPE-JSON und meldet Änderungen. Deutet auf ein einfacheres abgestimmtes
  JSON-Format statt der komplexen newOrder/Workflow-Referenz — der frühere
  Blocker „Stempel-Workflow" entfällt damit womöglich. WARTET auf ihre JSON.

### 6g. Anzeige-Inkonsistenzen bei GPE-Produkten (Livegang-Themen, 20.07.2026)

Der Rabatt selbst stimmt — der Warenkorb zeigt den korrekten GPE-Preis. Aber der
Preis ist an drei Stellen unterschiedlich, weil nicht jede Stelle GPE aufruft.
Am 4911 mit Kunde 10-000-943 (designerDiscount 0,1 + genereller discount 0,12)
beobachtet:

| Stelle | Preis | Quelle |
|---|---|---|
| Galerie / Produktliste | 15,00 € | Medusa-Variantenpreis (Pro-forma-Platzhalter), GPE NICHT aufgerufen |
| Produktseite (Vorschau) | 10,11 € | GPE-Basispreis, aber OHNE Kundenrabatt (Route sendet kein customer_id, siehe 6a) |
| Warenkorb | 8,01 € | GPE mit allen Kundenrabatten — der maßgebliche Preis |

Der Warenkorbwert 8,01 = 10,11 × 0,9 × 0,88: GPE stapelt die kundeneigenen
Rabatte selbst. Unser Client schickt den ganzen Kunden als customerInfo, GPE ist
also die volle Preis-Autorität.

**Vor Livegang zu klären/schließen:**
1. ✓ **ERLEDIGT 20.07.2026:** Der Produkt-Sync schreibt jetzt den GPE-Basispreis
   in den Medusa-Variantenpreis (`updateProductVariantsWorkflow`). Galerie zeigt
   den echten „ab"-Preis (10,11). Nur Punkt 2 (Vorschau ohne Rabatt, siehe 6a)
   bleibt offen.

2. ✓ **ERLEDIGT 21.07.2026:** Produktseite zeigt jetzt den Rabatt. customer_id
   kommt aus req.auth_context (siehe 6a). Vorschau, Warenkorb und Galerie
   stimmen für angemeldete Kunden überein.

### 6h. Kunden-Schreibpfad Medusa→GPE — Stand 22.07.2026

Umgesetzt bis zur GPE-Rechtegrenze. **Modell verfeinert gegenüber 6f:** Statt
Kunden automatisch in GPE anzulegen (dafür ist kein Anlege-Endpunkt belegt) oder
automatisch abzugleichen (kein zuverlässiger eindeutiger Schlüssel — E-Mail nicht
immer vorhanden, Firma/Adresse nur unscharf; ein Fehltreffer schriebe in einen
fremden Kundenstamm), gilt **Weg 1: ein Mensch verknüpft**. Die GPE-Kunden
existieren dort schon; jemand trägt die GPE-Kunden-ID am Medusa-Kunden ein.

**Fertig & verifiziert:**
- **Admin-Widget** `src/admin/widgets/customer-gpe-id.tsx` (Zone
  `customer.details.after`): GPE-Kunden-ID eingeben → **Prüfen** (zeigt
  Firma/Adresse/Rabatt via `GET /admin/erp/customer/:gpeId`) → **Speichern** nach
  `customer.metadata.gpe_id` (`POST /admin/customers/:id`, bestehende Metadaten
  bleiben erhalten). Löst „gpe_id nur roh über metadata".
- **config.json-Discovery** im Client (`getExactOnlineBaseUrl`, gecacht,
  nicht-blockierend; braucht `gpe_host`/`gpe_port`). Schreib-Basis-URL live
  bestätigt: `https://bolasys.selfhost.eu:8443/ExactOnlineConnector/webresources`.
- **Client-Schreibmethoden** (Vorbild: Referenz `setGPECustomer`/`setNewContact`):
  `updateCustomer` (ganzes Objekt an `…/customers/customer/update`), `addContactRaw`
  (`…/update/newcontact`, `###ERROR###`-Prefix VOR dem HTTP-Status prüfen),
  `addAddressToCustomerIfNotExists` / `addContactToCustomerIfNotExists` (nicht
  überschreibend, Read-Modify-Write). `npx tsc --noEmit` grün.
- **Test-Infrastruktur:** GPE-Testkunde `10-004-444`; npm-Skripte `smoke:gpe`
  (nur lesen) und `smoke:gpe:write` (`WRITE_TEST=1`, schreibt Test-Adresse +
  Kontakt an `10-004-444`).

**GELÖST 22.07.2026 — ExactOnline-Schreiben funktioniert.** War HTTP 401, weil die
`medusa`-Kennung (Company 999) nur Lese-, keine Schreibrechte auf den
**ExactOnlineConnector** hatte (getrennter Server vom lesenden CustomerDataServer).
Die Chefin hat die Schreibrechte gesetzt; `npm run smoke:gpe:write` legt jetzt am
Testkunden `10-004-444` einen Kontakt (`number 21536`) und eine Adresse
(`number 382751`, `type 4`) an — end-to-end verifiziert, ohne Codeänderung.
Merker: Eine Rechte-Umstellung kappte kurz auch das **Lesen** — Kundenabfragen
sind mandantengebunden (Header `Company-ID: 999`), Produkte nicht.

**Schritt 2b FERTIG & end-to-end verifiziert (23.07.2026):**
- `order.placed`-Subscriber (`src/subscribers/order-placed-gpe-customer.ts`) +
  Service-Delegates hängen bei Bestellung eines verknüpften Kunden Adresse +
  Kontakt an den GPE-Kunden an (nicht überschreiben). An echter Bestellung
  bewiesen (Maxi Musterfrau → Kontakt 21539 + Adresse).
- **Dedup verifiziert:** 2. Schreiben gibt die bestehende Nummer zurück, kein
  Duplikat (contacts UND addresses kommen in der `customers/filter`-Antwort mit).
- **Firmenname** bewusst NICHT gesendet: hängt am Hauptadressat des Kunden;
  Zusatzadressen können ihn in GPE gar nicht tragen (Auskunft Chefin).
- **Bundesland:** Medusa liefert Freitext, GPE will ISO-Code (Bayern → `BY`,
  empirisch bestätigt — sonst „(invalid option)" im Select). Mapping-Tabelle
  `DE_PROVINCE_TO_CODE` im Subscriber; Unbekanntes → nicht senden.

**Wirklich noch offen:**
- State-Mapping für GB/FR/NL (nur DE fertig) — bei Bedarf, sobald deren
  GPE-Optionswerte bekannt sind.
- Testdaten an `10-004-444` in GPE aufräumen (alle mit `comment: "created with medusa"`).

## 7. Offene Fragen

- **Mandantenfähigkeit:** Ein Medusa-Prozess pro Mandant (wie Rossini) oder einer für
  alle? Bestimmt, ob der Token-Cache pro `company_id` laufen muss.
- ~~**Zugangsdaten**~~ — beantwortet 16.07.2026: eigene Kennung `medusa`,
  Company 999, siehe Abschnitt 6.
- ~~**`exp`-Einheit**~~ — beantwortet 16.07.2026: **Millisekunden**
  (gemessen: `exp = 1784186301460`). Die Heuristik in `gpe-client.ts:73`
  (< 1e12 = Sekunden) trifft damit zu, und der Vergleich des Original-Servers
  in Teil 2 war doch korrekt. Die Warnung dort kann entschärft werden.
- ~~**Schreibrichtung**~~ — geklärt 20.07.2026: Für den Bestellversand MUSS
  Medusa Kunde/Adresse/Kontakt in GPE anlegen können (Webshop-Kunden existieren
  dort nicht vorab). Teil des optionalen Versand-Bausteins, siehe 6f.
  **Präzisiert 22.07.2026 → Stand & Blocker in 6h:** Modell auf Weg 1 geändert —
  GPE-Kunden existieren doch vorab und werden per Admin-Widget vom Menschen
  verknüpft (kein Auto-Anlegen). Adresse/Kontakt-Schreibpfad ist code-seitig
  fertig, wartet aber auf ExactOnline-Schreibrechte für die `medusa`-Kennung
  (HTTP 401).
- **GPE-Stempel-Workflow:** womöglich hinfällig — Bestellversand geht laut Chefin
  über einen JSON-Vergleich (siehe 6f), nicht die komplexe Workflow-Referenz.
- ~~**Rabatt-Testkunde**~~ — erledigt 20.07.2026: 10-000-393 (6 %) und
  10-000-943 (10 %) gefunden, live verifiziert (6e/6g).
- ~~**Rabatt-Stacking**~~ — geklärt 24.07.2026: **stapeln ist gewollt.** Der
  GPE-`designerDiscount` ist ein Designer-Rabatt, eine Medusa-Promotion ein
  Produkt-/Marketing-Rabatt — verschiedene Arten, dürfen sich addieren. Aktuelles
  Verhalten korrekt, keine Codeänderung. Details in 6e.

- ~~**Preis ohne Optionen**~~ — beantwortet 16.07.2026: **ja**. GPE liefert
  auch bei "useDefaultOptionValues:false" und leeren `optionValues` einen
  Preis (4911 → 10,11 €). Die Produktliste kann also einen „ab"-Preis zeigen.
- ~~**Maß-Pfad (`width`/`height`)**~~ — gelöst 16.07.2026, siehe 6d: fehlte
  `componentSettingsPath` auf den Feldern. Flächenpreis läuft über die
  area-Option. 
- **Auto-Fill required-Optionen (ruht):** Nur relevant, falls GPE ein
  flächenbepreistes Produkt bekommt. Solange GPE bei Stempeln bleibt, tritt der
  Fall nicht auf. Mechanik verstanden (siehe 6d), Umsetzung bei Bedarf.

