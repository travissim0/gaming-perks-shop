import nodemailer from 'nodemailer';

// Sends Infantry account emails (password resets) through AWS SES SMTP.
// Config comes from .env.local (INFANTRY_SMTP_*), mirroring the account
// server's email.xml. Credentials never reach the client.

const g = globalThis as unknown as { __infantryMailer?: nodemailer.Transporter };

function getTransport(): nodemailer.Transporter {
  // Host/port/from are stable and default here, so only USER + PASSWORD are required.
  const host = process.env.INFANTRY_SMTP_HOST || 'email-smtp.us-west-2.amazonaws.com';
  const user = process.env.INFANTRY_SMTP_USER;
  const pass = process.env.INFANTRY_SMTP_PASSWORD;
  if (!user || !pass) {
    throw new Error('SMTP is not configured. Set INFANTRY_SMTP_USER and INFANTRY_SMTP_PASSWORD in .env.local.');
  }
  if (!g.__infantryMailer) {
    g.__infantryMailer = nodemailer.createTransport({
      host,
      port: parseInt(process.env.INFANTRY_SMTP_PORT || '587', 10),
      secure: false, // STARTTLS on 587
      requireTLS: true,
      auth: { user, pass },
    });
  }
  return g.__infantryMailer;
}

/** Authenticates against SES without sending anything. */
export async function verifyMailer(): Promise<void> {
  await getTransport().verify();
}

export function buildResetLink(token: string): string {
  const base = process.env.INFANTRY_RESET_URL || 'http://account.freeinfantry.com/reset-password.html?token=';
  // Raw append (no URL-encoding) to match the account server — the reset page
  // is known to accept the '+' and '/' that appear in base64 tokens.
  return base + token;
}

export async function sendResetEmail(to: string, username: string, token: string): Promise<string> {
  const from = process.env.INFANTRY_SMTP_FROM || 'noreply@freeinfantry.com';
  const link = buildResetLink(token);
  const subject = 'A recovery request has been issued using this email address.';
  const text =
    `Please click the following link to reset your password: ${link}\n\n` +
    `Your username is: ${username}\n\n` +
    `If you didn't send this request, you can safely delete this email.`;
  await getTransport().sendMail({ from, to, subject, text });
  return link;
}
