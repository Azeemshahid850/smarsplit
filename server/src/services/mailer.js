import nodemailer from 'nodemailer';

// Three ways out, first one configured wins:
// 1. Gmail API over HTTPS (GMAIL_*) — works on hosts that block SMTP ports, like Render's free tier.
// 2. SMTP (SMTP_*), e.g. Brevo on port 2525.
// 3. Nothing configured (dev / FYP demo): log the message instead of sending.
const gmail = process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET;

const smtp = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

// Builds the raw RFC 822 message the Gmail API wants; sends nothing itself.
const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });

let gmailToken = null; // { value, expiresAt }

async function gmailAccessToken() {
  if (gmailToken && Date.now() < gmailToken.expiresAt) return gmailToken.value;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail sign-in refused: ${body.error_description || body.error || res.status}`);
  gmailToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
  return gmailToken.value;
}

async function sendWithGmail(message) {
  const { message: raw } = await composer.sendMail(message);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await gmailAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: raw.toString('base64url') }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail refused the message: ${body.error?.message || res.status}`);
  return `gmail id ${body.id}`;
}

/** False when no email is configured — the UI then tells the user to share the link itself. */
export const isMailConfigured = () => Boolean(gmail || smtp);

export async function sendMail({ to, subject, html, text }) {
  if (!isMailConfigured()) {
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
    return { delivered: false };
  }
  const message = { from: process.env.MAIL_FROM || 'SmartSplit <no-reply@smartsplit.app>', to, subject, html, text };
  // Callers swallow failures so a mail problem never fails a money operation —
  // which means this log line is the only place the reason ever shows up.
  try {
    const response = gmail ? await sendWithGmail(message) : ((await smtp.sendMail(message)).response ?? '');
    console.log(`[mail] sent to=${to} subject="${subject}" response=${response}`);
    return { delivered: true };
  } catch (err) {
    console.error(`[mail] FAILED to=${to} subject="${subject}": ${err.message}`);
    throw err;
  }
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
