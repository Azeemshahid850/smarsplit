import nodemailer from 'nodemailer';

// No SMTP configured (dev / FYP demo): log the link instead of sending.
// ponytail: console fallback, swap for a real provider before production.
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
    return { delivered: false };
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM || 'SmartSplit <no-reply@smartsplit.app>', to, subject, html, text });
  return { delivered: true };
}

export function sendPasswordResetMail(to, resetUrl) {
  return sendMail({
    to,
    subject: 'Reset your SmartSplit password',
    text: `Reset your password: ${resetUrl}\nThis link expires in 30 minutes. Ignore this email if you did not request it.`,
    html: `<p>Reset your SmartSplit password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Expires in 30 minutes.</p>`,
  });
}
