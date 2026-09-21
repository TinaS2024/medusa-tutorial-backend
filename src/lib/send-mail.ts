import nodemailer from "nodemailer";

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

/**
 * Ein Dateianhang. `content` ist der fertige Dateiinhalt als Buffer –
 * bei uns später das gerenderte Rechnungs-PDF.
 */
export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function sendMail(opts: {
  smtp: SmtpSettings;
  from: string;
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}) {
  const transporter = nodemailer.createTransport({
    host: opts.smtp.host,
    port: opts.smtp.port,
    secure: opts.smtp.secure, // true = Port 465, false = STARTTLS (587)
    auth: { user: opts.smtp.user, pass: opts.smtp.pass },
  });

  await transporter.sendMail({
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    // Nur mitschicken, wenn wirklich etwas dranhängt. Ein leeres
    // attachments-Feld verwirrt manche Mailserver.
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
  });
}
