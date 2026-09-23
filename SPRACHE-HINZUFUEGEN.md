# Eine weitere Sprache hinzufügen

Der Shop wird mit vier Sprachen ausgeliefert: Deutsch, Englisch,
Französisch und Niederländisch. Dieses Rezept beschreibt, wie eine weitere
dazukommt — hier am Beispiel **Italienisch (`it`)**.

Sie brauchen dafür Zugriff auf den Quellcode und die Übersetzungen. Alles
andere ist Kopieren und Ausfüllen. Rechnen Sie mit einem halben Tag für die
Technik; die Zeit fürs Übersetzen kommt dazu.

> **Wichtig:** Ändern Sie nichts an der Struktur der Dateien, nur an den
> Texten. Vergessen Sie einen der Schritte 2 bis 5, meldet TypeScript das
> beim Bauen — der Shop geht dadurch nicht kaputt.

---

## Was Sie damit übersetzen — und was nicht

| Wird übersetzt | Wie |
|---|---|
| Oberfläche des Shops: Warenkorb, Kasse, Kundenkonto | dieses Rezept |
| Oberfläche im Admin: die Zusatzbereiche | dieses Rezept |
| E-Mails an Kunden | dieses Rezept |
| Rechnungen und Gutschriften | dieses Rezept |
| **Produktnamen, Beschreibungen, Kategorien** | **nicht** hier, sondern im Admin unter *Übersetzungen* |

Die Produktinhalte stehen in der Datenbank, nicht im Quellcode. Sobald die
neue Sprache eingebaut ist, können Sie sie im Admin unter *Übersetzungen*
pflegen, ohne einen Entwickler.

---

## Schritt 1 — Die Sprache anmelden

Zwei Dateien, je eine Zeile.

**`medusa-storefront/src/lib/languages.ts`**

```ts
export const LANGUAGES = [
  { code: "de", locale: "de-DE", label: "DE" },
  { code: "en", locale: "en-GB", label: "EN" },
  { code: "fr", locale: "fr-FR", label: "FR" },
  { code: "nl", locale: "nl-NL", label: "NL" },
  { code: "it", locale: "it-IT", label: "IT" },   // neu
] as const;
```

**`medusa-backend/src/admin/lib/languages.ts`**

```ts
export const LANGUAGES = [
  { code: "de", locale: "de-DE", label: "Deutsch" },
  { code: "en", locale: "en-GB", label: "English" },
  { code: "fr", locale: "fr-FR", label: "Français" },
  { code: "nl", locale: "nl-NL", label: "Nederlands" },
  { code: "it", locale: "it-IT", label: "Italiano" },   // neu
] as const;
```

- `code` — das zweistellige Kürzel. Es taucht in Cookies, Bestellungen und
  Rechnungen auf.
- `locale` — das vollständige Gebietsschema. Es bestimmt, wie Datum und
  Beträge geschrieben werden (`1.234,56 €` gegenüber `1,234.56 €`).
- `label` — was der Kunde beziehungsweise der Admin-Benutzer in der
  Sprachauswahl sieht. Im Shop sind es Kürzel, im Admin die Namen der
  Sprachen. Übernehmen Sie diese Schreibweise.

Mehr ist für den Sprachumschalter im Shop nicht nötig: Er liest diese Liste.

---

## Schritt 2 — Texte des Shops

1. `medusa-storefront/src/locales/en.json` kopieren zu `it.json`.
2. Die Werte übersetzen. **Die Schlüssel links vom Doppelpunkt bleiben
   unverändert.**
3. Platzhalter in geschweiften Klammern wie `{reference}` oder `{count}`
   müssen erhalten bleiben. Sie werden zur Laufzeit ersetzt.

**`medusa-storefront/src/lib/messages.ts`** — die neue Datei eintragen:

```ts
import de from "../locales/de.json";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import nl from "../locales/nl.json";
import it from "../locales/it.json";        // neu

const FILES: Record<Lang, unknown> = { de, en, fr, nl, it };   // neu
```

Sie dürfen die Übersetzung in Etappen machen: Was in `it.json` fehlt oder
leer ist, wird automatisch aus `en.json` genommen. Der Shop zeigt dann
englische statt leerer Stellen.

---

## Schritt 3 — Texte im Admin

Dasselbe für die Zusatzbereiche im Admin:

1. `medusa-backend/src/admin/locales/en.json` kopieren zu `it.json`,
   übersetzen.
2. In **`medusa-backend/src/admin/lib/messages.ts`** eintragen, genau wie
   in Schritt 2.

In dieser Datei stehen auch die **E-Mail-Vorlagen** für Kunden, im
Abschnitt `email_templates` — Bestellbestätigung, Statusmeldung und
Passwort-Mail. Übersetzen Sie die mit.

> Medusas eigene Oberfläche bringt ihre Übersetzungen selbst mit. Ist Ihre
> Sprache dort nicht dabei, bleibt der Medusa-Teil englisch, Ihre
> Zusatzbereiche folgen dann diesem Rezept.

---

## Schritt 4 — Rechnungstexte

**`medusa-backend/src/lib/invoice/texts.ts`**

In dieser Datei stehen zwei Listen. In **beiden** brauchen Sie einen neuen
Block. Kopieren Sie jeweils den `en`-Block und übersetzen Sie ihn:

- `INVOICE_TEXTS` — alles, was auf dem PDF steht: Überschriften,
  Spaltennamen, „Zahlbar ohne Abzug bis zum", der Hinweis auf die
  Erstattung.
- `INVOICE_MAIL_TEXTS` — Betreff und Text der Mail, mit der ein Dokument
  verschickt wird.

```ts
  it: {
    invoice: "Fattura",
    cancellation: "Fattura di storno",
    // … alle weiteren Einträge aus dem en-Block
  },
```

Lassen Sie hier **keinen** Eintrag weg. Anders als bei den Sprachdateien
gibt es für Rechnungen keine automatische Ergänzung aus dem Englischen —
eine Rechnung soll nicht halb in der einen und halb in der anderen Sprache
erscheinen. TypeScript meldet fehlende Einträge beim Bauen.

---

## Schritt 5 — Pflichtangaben, falls sich auch das Sitzland ändert

Diesen Schritt brauchen Sie **nur**, wenn Ihr Unternehmen in einem Land
sitzt, das noch nicht hinterlegt ist. Die ausgelieferten Sitzländer sind
Deutschland, Frankreich, Niederlande und Großbritannien.

**`medusa-backend/src/lib/invoice/country-rules.ts`** — einen Eintrag
ergänzen, mit den in Ihrem Land üblichen Bezeichnungen der Kennnummern:

```ts
  it: {
    tax_number: "Codice fiscale",
    vat_id: "Partita IVA",
    register: "REA",
  },
```

Danach im Admin unter *Rechnungen* das **Sitzland des Verkäufers**
auswählen.

> **Lassen Sie die Pflichtangaben von Ihrer Steuerberatung prüfen.** Welche
> Angaben eine Rechnung in Ihrem Land tragen muss, kann der Shop nicht
> wissen.

---

## Schritt 6 — Bauen und prüfen

```
cd medusa-backend   && npm run build
cd medusa-storefront && npm run build
```

Danach beide Dienste neu starten.

**Prüfen Sie diese fünf Punkte:**

1. Im Shop erscheint die neue Sprache im Umschalter. Nach dem Umschalten
   sind Warenkorb und Kasse übersetzt.
2. **Das Land in der Adresse ändert sich beim Umschalten nicht.** Sprache
   und Lieferland sind getrennt; das Land wählt der Kunde im Menü.
3. Eine Testbestellung in der neuen Sprache aufgeben. Die Status-Mail muss
   in dieser Sprache ankommen.
4. Dazu eine Rechnung erstellen: Das PDF muss übersetzt sein. Die
   Kennnummern in der Fußzeile bleiben in ihrer Landesschreibweise, etwa
   „USt-IdNr." — das ist beabsichtigt, es sind Eigennamen.
5. Im Admin oben rechts die Sprache umstellen und die Zusatzbereiche
   ansehen.

---

## Hauptsprache des Shops festlegen

Unabhängig von der neuen Sprache: Welche Sprache ein Besucher **ohne**
eigene Auswahl sieht, legen Sie an zwei Stellen fest.

**Shop** — in der Umgebungsdatei des Storefronts:

```
NEXT_PUBLIC_DEFAULT_LOCALE=it
```

Diese Angabe wird beim Bauen fest eingesetzt. Eine Änderung wirkt erst
nach einem neuen `npm run build`.

**E-Mails und Rechnungen** — im Admin unter *E-Mail-Einstellungen* das Feld
*E-Mail-Sprache*. Sie gilt, wenn zu einem Vorgang keine Sprache bekannt
ist, etwa bei einer Passwort-Mail.

Eine Sprache, die der Shop nicht anbietet — zum Beispiel ein spanischer
Browser —, führt immer zu **Englisch**, nie zu einer zufälligen anderen
Sprache.

---

## Wenn etwas nicht stimmt

| Beobachtung | Ursache |
|---|---|
| Beim Bauen bricht es mit einer Meldung zu `Record<Lang, …>` ab | Schritt 2, 3 oder 4 fehlt: Die Sprache ist angemeldet, aber eine Datei oder ein Block fehlt. |
| Einzelne Stellen im Shop sind englisch statt übersetzt | In `it.json` fehlt dieser Eintrag oder er ist leer. Ergänzen und neu bauen. |
| Auf der Rechnung steht `{number}` oder `{reference}` | Ein Platzhalter wurde beim Übersetzen verändert. Er muss genau so bleiben. |
| Die neue Sprache fehlt im Umschalter | Schritt 1 im Storefront fehlt, oder es wurde nicht neu gebaut. |
| Datum oder Beträge sehen falsch aus | Das `locale` in Schritt 1 prüfen, etwa `it-IT` statt nur `it`. |
