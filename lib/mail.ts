import "server-only";
import nodemailer from "nodemailer";

// Athena's own sending account (PRD §23.6 j), for the This week email: plain SMTP, so any provider works. Its
// settings live in `.env` only: SMTP_HOST, SMTP_PORT (465 for SSL, else STARTTLS), SMTP_USER, SMTP_PASS, and MAIL_FROM
// (the From line, e.g. `Athena <athena@example.com>`; SMTP_USER when unset). With them unset, mailReady() is false and
// the email controls stay hidden, so the founder and judges never see a send that can't happen.

export const mailReady = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: nodemailer.Transporter | undefined;
function transporter(): nodemailer.Transporter {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  }
  return transport;
}

/** Send one email. True when the provider took it. */
export async function sendMail(m: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  if (!mailReady()) return false;
  try {
    await transporter().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, ...m });
    return true;
  } catch (e) {
    console.warn("[mail] send failed:", (e as Error).message);
    return false;
  }
}

/** A plausible email address: one @, a dot in the domain, no spaces, at most 254 characters. */
export const isEmail = (s: unknown): s is string => typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
