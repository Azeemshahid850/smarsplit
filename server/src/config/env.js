const REQUIRED = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const PLACEHOLDERS = ['replace_with_long_random_string', 'replace_with_different_long_random_string'];

/**
 * Fails fast rather than booting a production server with a missing or
 * placeholder secret — a silent default here would be a signing key anyone
 * who has read the repo already knows.
 */
export function assertEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);

  if (process.env.NODE_ENV !== 'production') return;

  const placeholder = REQUIRED.filter((key) => PLACEHOLDERS.includes(process.env[key]));
  if (placeholder.length) throw new Error(`Refusing to start: ${placeholder.join(', ')} still hold the example value`);

  const weak = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((key) => process.env[key].length < 32);
  if (weak.length) throw new Error(`Refusing to start: ${weak.join(', ')} must be at least 32 characters`);

  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('Refusing to start: the access and refresh secrets must differ');
  }
  if (!process.env.CLIENT_URL) throw new Error('Refusing to start: CLIENT_URL is required in production (CORS + cookies)');
}
