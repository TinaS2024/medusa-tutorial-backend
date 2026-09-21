import fs from "fs/promises";
import path from "path";

/**
 * Das Verzeichnis, in dem die Rechnungs-PDFs liegen.
 *
 * Der Ort ist aus zwei Gründen so gewählt:
 *
 * 1. NICHT `static`: Den liefert Medusa öffentlich aus. Wer einen
 *    Dateinamen errät, käme an fremde Rechnungen – mit Namen, Anschrift
 *    und Kaufhistorie. Hier gibt nur eine angemeldete Route die Datei
 *    heraus, die vorher prüft, wem sie gehört.
 *
 * 2. Unterhalb von `private`, weil Medusas Entwicklungsserver den
 *    Projektordner überwacht und bei jeder neuen Datei neu startet. Lag
 *    das PDF direkt unter `invoices/`, brach jede Rechnungserstellung die
 *    laufende Anfrage ab. `private` steht auf seiner Ausnahmeliste.
 *    Ein eigener INVOICE_STORAGE_DIR muss ebenfalls ausserhalb der
 *    überwachten Ordner liegen.
 *
 * Die Ordner-Erkennung stammt aus eurer medusa-config.ts: Im gebauten
 * Zustand läuft Medusa aus `.medusa/server`, dann liegt das Projekt zwei
 * Ebenen darüber. Ohne diese Unterscheidung lägen die Rechnungen nach
 * jedem Bauen woanders.
 */
export function invoiceDir(): string {
  const cwd = process.cwd();
  const isCompiledServerDir =
    path.basename(cwd) === "server" && path.basename(path.dirname(cwd)) === ".medusa";
  const projectRoot = isCompiledServerDir ? path.resolve(cwd, "..", "..") : cwd;

  const configured = process.env.INVOICE_STORAGE_DIR;
  return configured
    ? path.resolve(projectRoot, configured)
    : path.join(projectRoot, "private", "invoices");
}

/**
 * Schreibt ein PDF und gibt den vollständigen Pfad zurück.
 *
 * `path.basename` ist kein Schönheitsfehler: Käme als Dateiname jemals
 * etwas wie "../../.env" an, würde ohne diese Zeile eine fremde Datei
 * überschrieben. So bleibt garantiert alles im Rechnungsordner.
 */
export async function saveInvoicePdf(filename: string, content: Buffer): Promise<string> {
  const dir = invoiceDir();
  await fs.mkdir(dir, { recursive: true });

  const target = path.join(dir, path.basename(filename));
  await fs.writeFile(target, content);

  return target;
}

/** Liest ein gespeichertes PDF wieder ein. */
export async function readInvoicePdf(filename: string): Promise<Buffer> {
  return fs.readFile(path.join(invoiceDir(), path.basename(filename)));
}
