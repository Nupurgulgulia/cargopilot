import "server-only";
import nodemailer from "nodemailer";

// Outgoing email over SMTP (Gmail app password, Brevo, Outlook…), configured by env:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM ("CargoPilot <bookings@example.com>").

export function mailerEnabled() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail(msg: { to: string; replyTo: string; subject: string; text: string; html: string }) {
  if (!mailerEnabled()) throw new Error("Email sending isn't set up on this server yet.");
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || `CargoPilot <${process.env.SMTP_USER}>`,
    ...msg,
  });
  return { messageId: info.messageId, previewUrl: nodemailer.getTestMessageUrl(info) || null };
}
