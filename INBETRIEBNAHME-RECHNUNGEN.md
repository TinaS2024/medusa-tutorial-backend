# Rechnungen — Inbetriebnahme

Diese Erweiterung erstellt Rechnungen, Stornorechnungen und
Rechnungskorrekturen als PDF, verschickt sie an den Kunden und stellt sie
im Kundenkonto und im Admin bereit.

Arbeiten Sie diese Liste **vollständig** ab, bevor die erste echte
Bestellung eingeht. Mehrere Punkte lassen sich später nicht mehr
korrigieren.

---

## 1. Entscheidungen, die vorher feststehen müssen

Ein ausgestelltes Dokument wird nie verändert und nie neu erzeugt. Was auf
einer Rechnung steht, bleibt dort. Diese drei Punkte gelten deshalb nur für
Dokumente, die **danach** entstehen — bestehende behalten ihren Stand.

| Entscheidung | Wo | Warum nicht nachträglich |
|---|---|---|
| Präfix und Stellenzahl der Rechnungsnummern (`RE-000001`) | Admin → Rechnungen | Rechnungsnummern müssen fortlaufend und eindeutig sein. Ein Wechsel mittendrin erzeugt zwei Nummernkreise in einem Geschäftsjahr. |
| Präfix für Stornos und Korrekturen (`GS-000001`) | Admin → Rechnungen | dasselbe |
| Heißt das Korrekturdokument „Rechnungskorrektur" oder „Gutschrift"? | Datei `src/lib/invoice/texts.ts`, Schlüssel `credit_note`, je Sprache eine Zeile | Der Begriff „Gutschrift" ist im deutschen Steuerrecht doppelt belegt (§ 14 Abs. 2 UStG meint damit eine vom Empfänger ausgestellte Rechnung). Klären Sie die Bezeichnung mit Ihrer Steuerberatung. |

**Wenn Sie aus einem früheren System kommen:** Setzen Sie das Präfix und die
Stellenzahl so, dass Ihre Nummernfolge lückenlos weiterläuft. Der Zähler
selbst beginnt bei 1 und lässt sich über die Oberfläche nicht setzen —
wenden Sie sich dafür an Ihren technischen Ansprechpartner.

---

## 2. Angaben, die eingetragen sein müssen

Die Rechnung setzt sich aus drei Admin-Bereichen zusammen, für den Versand
kommt ein vierter dazu. Fehlt eine Angabe, fehlt sie auch auf dem
Dokument — ohne Warnung.

### Admin → Impressum

| Feld | Erscheint auf der Rechnung als |
|---|---|
| Firma | Absender oben rechts und in der Fußzeile |
| Anschrift | ebenda |
| USt-IdNr. | Fußzeile |
| Registereintrag | Fußzeile |
| E-Mail | Fußzeile |

### Admin → Bankverbindung

| Feld | Erscheint auf der Rechnung als |
|---|---|
| Kontoinhaber, Bank, IBAN, BIC | Block „Bankverbindung" unter dem Zahlungsziel |

Tragen Sie bei IBAN und BIC **nur die Nummer** ein, ohne „IBAN:" oder
„BIC:" davor. Die Rechnung setzt die Bezeichnung selbst davor — sonst steht
auf dem Dokument `IBAN: IBAN: DE02…`.

| Richtig | Falsch |
|---|---|
| `DE02120300000000202051` | `IBAN: DE02120300000000202051` |
| `BYLADEM1001` | `BIC: BYLADEM1001` |

> **Achtung:** Zum Testen ist hier möglicherweise ein Testkonto hinterlegt.
> Ersetzen Sie es vor der ersten echten Rechnung. Dieselben Angaben
> erscheinen auch in der Bestellbestätigung bei Vorkasse.
>
> Erscheinen die Felder beim Öffnen leer, obwohl Sie schon etwas
> eingetragen hatten, ist meist die Admin-Sitzung abgelaufen. Laden Sie die
> Seite neu oder melden Sie sich neu an — und drücken Sie auf der leeren
> Seite **nicht** auf Speichern, sonst werden die Bankdaten gelöscht.

### Admin → E-Mail-Einstellungen

Ohne Postausgang entstehen Rechnungen zwar, werden aber nicht verschickt.
Im Admin erscheint dann bei jeder Rechnung *noch nicht verschickt*.

| Feld | Hinweis |
|---|---|
| SMTP-Server, Port, Benutzer, Passwort | Die Zugangsdaten des Postfachs, von dem aus verschickt wird. |
| Absender-E-Mail | **Muss zum Konto aus „Benutzer" gehören.** |
| Absender-Name | Erscheint beim Kunden als Absender, zum Beispiel Ihr Firmenname. |

**Die Absenderadresse muss zum SMTP-Konto passen.** Mailanbieter
erlauben nur den Versand unter der eigenen Adresse. Melden Sie sich zum
Beispiel mit einem privaten GMX-Konto an und tragen als Absender
`info@ihre-firma.de` ein, lehnt der Server jede Mail ab. Im Admin erscheint
dann eine Meldung wie:

```
keine Mail: 550 5.7.1 <info@ihre-firma.de> is not an authorized sender …
```

Verwenden Sie deshalb den **Mailserver Ihrer eigenen Domain** — also das
Postfach, zu dem die Absenderadresse gehört. Die Zugangsdaten nennt Ihnen
Ihr Domain- oder Mailanbieter. Selbst wenn ein fremder Server die Mail
durchließe, würden viele Empfänger sie als verdächtig einstufen und im
Spam ablegen.

Rechnungen, die wegen eines Fehlers nicht verschickt wurden, müssen Sie
nicht neu erstellen: Nach der Korrektur im Admin an der Bestellung auf
**Senden** klicken.

### Admin → Rechnungen

| Feld | Bedeutung |
|---|---|
| Wer erstellt die Rechnungen? | `Keine` / `Medusa` / `GPE`. Bei Auslieferung steht hier `Keine` — stellen Sie auf `Medusa` um, sobald alles andere eingetragen ist. |
| Ab welchem Produktionsstatus | Bei welchem Schritt die Rechnung entsteht. Voreinstellung: *Versandbereit*. |
| Sitzland des Verkäufers | Bestimmt, wie die Kennnummern in der Fußzeile heißen (Steuernummer / SIRET / KvK-nummer / Company reg. no.). |
| Steuernummer | Fußzeile. In Deutschland genügt Steuernummer **oder** USt-IdNr. |
| Zahlungsziel in Tagen | Ergibt das Datum hinter „Zahlbar ohne Abzug bis zum". |
| Fußzeile der Rechnung | Freitext, zum Beispiel ein Hinweis auf das OSS-Verfahren. |

> **Wichtig:** Klicken Sie hier nach der Installation **einmal auf
> Speichern**, auch wenn Sie nichts ändern. Erst dabei werden die beiden
> Nummernkreise angelegt. Ohne diesen Schritt bricht jede
> Rechnungserstellung ab, im Browser erscheint dann nur
> „Rechnung konnte nicht erstellt werden".

---

## 3. Fragen an Ihre Steuerberatung

Klären Sie diese Punkte, bevor Sie auf `Medusa` umstellen:

1. **Welches Unternehmen verkauft**, und gilt das OSS-Verfahren? Davon
   hängt ab, ob die Steuersätze des Lieferlands die richtigen sind, und was
   in die Fußzeile gehört.
2. **„Rechnungskorrektur" oder „Gutschrift"** als Bezeichnung (siehe 1).
3. **Steuernummer, USt-IdNr. oder beides** auf der Rechnung.
4. **Wie lange aufbewahrt werden muss.** Die Frist für Buchungsbelege wurde
   zuletzt geändert; lassen Sie sich den für Sie geltenden Zeitraum
   bestätigen und richten Sie die Datensicherung danach ein (siehe 6).

---

## 4. Installation auf dem Server

```
npm install
npx medusa db:migrate
```

`npm install` holt die beiden benötigten Bibliotheken (`pdfmake` für die
PDFs, `adm-zip` für den Export). `db:migrate` legt die beiden Tabellen an.

Ein `db:generate` ist **nicht** nötig — die Migrationsdateien liegen im
Quellcode.

Läuft der Shop im gebauten Zustand (`medusa start`), danach neu bauen und
den Dienst neu starten:

```
npm run build
```

Erst dann sind die neuen Programmteile aktiv. Anschließend im Admin unter
**Rechnungen** einmal speichern (siehe Abschnitt 2).

**Optional:** Mit der Umgebungsvariablen `INVOICE_STORAGE_DIR` lässt sich
der Ablageort der PDFs verlegen. Ohne Angabe ist es `private/invoices` im
Projektordner. Der Ordner darf **nicht** unterhalb von `static` liegen —
dieser wird öffentlich ausgeliefert.

---

## 5. Funktionsprüfung

Führen Sie diese Prüfung mit einer Testbestellung durch, **bevor** Sie den
Shop freischalten:

1. Testbestellung im Shop aufgeben.
2. Im Admin die Bestellung öffnen, Produktionsstatus auf den eingestellten
   Auslöser setzen, speichern.
3. Im Kasten **Rechnungen** erscheint eine Rechnung mit Nummer und Betrag.
4. **PDF öffnen** und prüfen:
   - Firma, Anschrift und Kennnummern in der Fußzeile
   - Bankverbindung und Zahlungsziel
   - Steuer je Satz ausgewiesen, Versandkosten als eigene Position
   - Gesamtbetrag stimmt mit der Bestellung überein
5. Im Postfach des Testkunden liegt eine Mail mit dem PDF im Anhang.
6. Im Kundenkonto unter *Bestellungen* ist die Rechnung abrufbar.
7. **Stornieren** klicken. Es entsteht eine Stornorechnung mit eigener
   Nummer und negativen Beträgen, ebenfalls per Mail.
8. Admin → Rechnungen → **ZIP herunterladen** für den heutigen Tag. Das
   Archiv enthält `rechnungen.csv` und den Ordner `pdf/`.

Löschen Sie die Testbestellung anschließend **nicht** — die Dokumente
gehören zur lückenlosen Nummernfolge. Wenn Sie mit einer leeren Nummernfolge
starten wollen, führen Sie die Prüfung auf einem Testsystem durch.

---

## 6. Laufender Betrieb

**Datensicherung.** Die PDFs liegen unter `private/invoices` und sind
bewusst **nicht** Teil der Versionsverwaltung. Sie müssen getrennt
gesichert werden. Eine Sicherung nur der Datenbank reicht nicht: Ohne die
Dateien gibt es keine Belege mehr.

**Export.** Erzeugen Sie regelmäßig — üblicherweise monatlich — über
Admin → Rechnungen den ZIP-Export und geben Sie ihn an Ihre Buchhaltung
weiter.

**Wenn ein Kunde seine Rechnung nicht findet.** Öffnen Sie die Bestellung
im Admin. Im Kasten *Rechnungen* steht bei jedem Dokument, ob und wann es
verschickt wurde. Über **Erneut senden** geht es noch einmal raus.

**Rechnungen werden nie gelöscht.** Auch eine falsche Rechnung bleibt
bestehen und wird durch eine Stornorechnung aufgehoben. Danach lässt sich
zur selben Bestellung eine neue, korrigierte Rechnung erstellen.

---

## 7. Was diese Erweiterung nicht leistet

Damit Sie nicht davon überrascht werden:

- **Kein Reverse Charge.** Rechnungen an Unternehmen im EU-Ausland mit
  USt-IdNr. werden wie Rechnungen an Verbraucher behandelt. Es gibt kein
  Feld für die USt-IdNr. des Kunden und keine Steuerbefreiung.
- **Kein Preisnachlass ohne Rückgabe.** Eine Korrektur bezieht sich immer
  auf Positionen der Rechnung. Eine reine Entschädigung („10 € wegen eines
  Kratzers") lässt sich damit nicht abbilden.
- **Keine E-Rechnung.** Es entstehen PDFs, kein ZUGFeRD oder XRechnung. Für
  den Verkauf an Verbraucher ist das zulässig. Für inländische Rechnungen
  zwischen Unternehmen gilt in Deutschland ab **1. Januar 2027** eine
  Versandpflicht für Unternehmen mit mehr als 800.000 € Vorjahresumsatz, ab
  **1. Januar 2028** für alle. Planen Sie das rechtzeitig ein, wenn Sie an
  Unternehmen verkaufen.
- **Gastbestellungen erreichen nur die E-Mail.** Wer ohne Kundenkonto
  bestellt, kann seine Rechnung später nicht selbst abrufen. Die Mail ist
  der einzige Zustellweg.
- **Keine automatische Prüfung auf Vollständigkeit.** Fehlt eine Angabe aus
  Abschnitt 2, bleibt die Stelle auf der Rechnung leer. Deshalb die
  Funktionsprüfung in Abschnitt 5.
