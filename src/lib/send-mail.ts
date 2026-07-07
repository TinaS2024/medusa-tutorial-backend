import nodemailer from "nodemailer";

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

export async function sendMail(opts: {
  smtp: SmtpSettings;
  from: string;
  to: string;
  subject: string;
  text: string;
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
  });
}
