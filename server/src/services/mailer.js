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

/** False when no SMTP is configured — the UI then tells the user to share the link itself. */
export const isMailConfigured = () => Boolean(transporter);

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

export function sendGroupInviteMail(to, { groupName, inviterName, joinUrl }) {
  return sendMail({
    to,
    subject: `${inviterName} invited you to "${groupName}" on SmartSplit`,
    text: `${inviterName} added you to "${groupName}" on SmartSplit.\n\nJoin here: ${joinUrl}\n\nIf you do not have an account yet, sign up with this email address and the link will connect you to the group.`,
    html: `<p><strong>${inviterName}</strong> invited you to join <strong>${groupName}</strong> on SmartSplit.</p>
<p><a href="${joinUrl}">Join the group</a></p>
<p style="color:#64748b;font-size:13px">No account yet? Sign up with this email address and the link will connect you to the group.</p>`,
  });
}

export function sendJoinRequestMail(to, { groupName, requesterName, groupUrl }) {
  return sendMail({
    to,
    subject: `${requesterName} asked to join "${groupName}"`,
    text: `${requesterName} asked to join "${groupName}".\n\nApprove or decline here: ${groupUrl}`,
    html: `<p><strong>${requesterName}</strong> asked to join <strong>${groupName}</strong>.</p><p><a href="${groupUrl}">Approve or decline</a></p>`,
  });
}
