// One-time helper: lets SmartSplit send email from your Gmail account through
// the Gmail API (works on Render's free tier, which blocks SMTP ports).
//
//   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npm run gmail:token
//
// Opens a Google sign-in link; after you allow "Send email on your behalf" it
// prints GMAIL_REFRESH_TOKEN. Put the three GMAIL_* values and MAIL_FROM into
// Render → Environment. The client must be a Google Cloud OAuth client of type
// "Desktop app" (loopback redirects need no registration).
import http from 'node:http';
import { OAuth2Client } from 'google-auth-library';

const { GMAIL_CLIENT_ID: clientId, GMAIL_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET first (Google Cloud → APIs & Services → Credentials).');
  process.exit(1);
}

const PORT = 5055;
const client = new OAuth2Client({ clientId, clientSecret, redirectUri: `http://localhost:${PORT}/oauth2callback` });
const url = client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // always hand back a refresh token
  scope: ['https://www.googleapis.com/auth/gmail.send'], // send only — cannot read the inbox
});

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, `http://localhost:${PORT}`).searchParams.get('code');
  if (!code) return res.end('Waiting for Google…');
  try {
    const { tokens } = await client.getToken(code);
    res.end('Done — go back to the terminal.');
    console.log(`\nGMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log('Add it to Render → smartsplit → Environment with GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and MAIL_FROM="SmartSplit <your-address@gmail.com>".');
  } catch (err) {
    res.end('Google refused the code — run the script again.');
    console.error(err.message);
  }
  server.close();
});

server.listen(PORT, () => console.log(`Open this link, sign in with the Gmail account that should send the emails, and allow access:\n\n${url}\n`));
