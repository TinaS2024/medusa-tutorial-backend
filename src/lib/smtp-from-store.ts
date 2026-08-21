import type { SmtpSettings } from "./send-mail";

/**
 * Liest die Postausgangs-Einstellungen aus den Shop-Zusatzdaten.
 *
 * Gibt null zurück, wenn nichts hinterlegt ist – dann kann nicht versendet
 * werden, und der Aufrufer sollte das protokollieren statt abzustürzen.
 */
export function smtpAusStore(md: Record<string, any> | null | undefined): {
  smtp: SmtpSettings
  from: string
} | null {
  const host = typeof md?.smtp_host === "string" ? md.smtp_host : "";
  const user = typeof md?.smtp_user === "string" ? md.smtp_user : "";
  const pass = typeof md?.smtp_pass === "string" ? md.smtp_pass : "";

  if (!host || !user || !pass) return null;

  const port = typeof md?.smtp_port === "number" ? md.smtp_port : 587;
  const fromEmail = typeof md?.email_from === "string" ? md.email_from : user;
  const fromName = typeof md?.email_from_name === "string" ? md.email_from_name : null;

  return {
    smtp: { host, port, secure: port === 465, user, pass },
    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
  }
}
