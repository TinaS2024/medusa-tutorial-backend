/**
 * Bereitet .medusa/server nach dem Build vor.
 *
 * Hintergrund: Der kompilierte Server läuft mit .medusa/server als
 * Arbeitsverzeichnis und findet dort weder die Upload-Dateien noch das
 * GPE-Zertifikat noch die .env. Statt alles von Hand hineinzukopieren:
 *
 *  - Ordner werden verknüpft (Junction/Symlink) und bleiben dadurch dauerhaft
 *    synchron – Uploads im laufenden Betrieb sind sofort sichtbar.
 *  - Dateien werden kopiert, weil Datei-Symlinks unter Windows erhöhte Rechte
 *    verlangen. Änderungen an der .env greifen daher erst nach erneutem Lauf.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const serverDir = path.join(root, ".medusa", "server");

const LINK_DIRS = ["static", "certs"];
const COPY_FILES = [".env"];

if (!fs.existsSync(serverDir)) 
{
  console.log("[prepare-server] .medusa/server fehlt – vermutlich ohne 'medusa build' aufgerufen. Übersprungen.");
  process.exit(0);
}

const linkDir = (name) => {
  const source = path.join(root, name);
  const target = path.join(serverDir, name);

  if (!fs.existsSync(source)) 
{
    console.log(`[prepare-server] ${name}: ./${name} existiert nicht – übersprungen.`);
    return;
  }

  let current = null;
  try {
    current = fs.lstatSync(target)
  } catch {}

  if (current?.isSymbolicLink()) 
    {
    console.log(`[prepare-server] ${name}: Verknüpfung besteht bereits.`);
    return;
  }

  if (current?.isDirectory()) 
{
    // Echter Ordner aus einem früheren Build: Dateien retten, ohne neuere zu überschreiben
    fs.cpSync(target, source, { recursive: true, force: false });
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[prepare-server] ${name}: vorhandene Dateien nach ./${name} übernommen.`);
  }

  try {
    fs.symlinkSync(source, target, "junction");
    console.log(`[prepare-server] ${name}: verknüpft → ${source}`);
  } catch (err) 
  {
    console.warn(`[prepare-server] ${name}: Verknüpfung fehlgeschlagen (${err.message}) – kopiere stattdessen.`);
    fs.cpSync(source, target, { recursive: true });
  }
}

const copyFile = (name) => {
  const source = path.join(root, name);

  if (!fs.existsSync(source)) {
    console.log(`[prepare-server] ${name}: ./${name} existiert nicht – übersprungen.`);
    return;
  }

  fs.copyFileSync(source, path.join(serverDir, name));
  console.log(`[prepare-server] ${name}: kopiert.`);
}

fs.mkdirSync(path.join(root, "static"), { recursive: true });
LINK_DIRS.forEach(linkDir);
COPY_FILES.forEach(copyFile);
