import { describe, it, expect, afterEach, vi } from 'vitest';

// The mailer picks its transport when it is first imported, so configure Gmail first.
process.env.GMAIL_CLIENT_ID = 'client-id';
process.env.GMAIL_CLIENT_SECRET = 'client-secret';
process.env.GMAIL_REFRESH_TOKEN = 'refresh-token';
process.env.MAIL_FROM = 'SmartSplit <azeem@gmail.com>';
const { sendMail, isMailConfigured } = await import('../services/mailer.js');

afterEach(() => vi.restoreAllMocks());

const gmailUp = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
    String(url).includes('oauth2.googleapis.com')
      ? Response.json({ access_token: 'access-1', expires_in: 3600 })
      : Response.json({ id: 'msg-1' }),
  );

describe('mail through the Gmail API', () => {
  it('signs in once, then sends a proper message', async () => {
    const fetch = gmailUp();
    expect(isMailConfigured()).toBe(true);

    await expect(sendMail({ to: 'sara@demo.pk', subject: 'Reset your SmartSplit password', text: 'Link: x', html: '<p>Link</p>' })).resolves.toEqual({ delivered: true });
    await sendMail({ to: 'ali@demo.pk', subject: 'Second', text: 'two' });

    const calls = fetch.mock.calls.map(([url]) => String(url));
    expect(calls.filter((url) => url.includes('oauth2')).length).toBe(1); // token reused
    const [, sendInit] = fetch.mock.calls.find(([url]) => String(url).includes('gmail.googleapis.com'));
    expect(sendInit.headers.Authorization).toBe('Bearer access-1');
    const raw = Buffer.from(JSON.parse(sendInit.body).raw, 'base64url').toString();
    expect(raw).toMatch(/^To: sara@demo\.pk$/m);
    expect(raw).toMatch(/^Subject: Reset your SmartSplit password$/m);
    expect(raw).toMatch(/^From: SmartSplit <azeem@gmail\.com>$/m);
  });

  it('rejects with the reason when Gmail refuses, so callers can fall back to the link', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('oauth2.googleapis.com')
        ? Response.json({ access_token: 'access-1', expires_in: 3600 })
        : Response.json({ error: { message: 'Daily sending quota exceeded' } }, { status: 429 }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendMail({ to: 'sara@demo.pk', subject: 'Hi', text: 'x' })).rejects.toThrow(/Daily sending quota exceeded/);
  });
});
