import { v2 as cloudinary } from 'cloudinary';

const configured = Boolean(process.env.CLOUDINARY_CLOUD_NAME);

if (configured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Uploads a receipt image privately and returns { url, publicId }.
 * Receipts are personal documents, so they go up as `authenticated` — the URL
 * is signed and expires, rather than being a permanent public link that anyone
 * with the address can read forever.
 *
 * ponytail: with no Cloudinary account configured the image is inlined as a
 * data URL so the whole flow still runs offline for the demo. Configure
 * CLOUDINARY_* before deploying.
 */
export async function uploadReceiptImage(buffer, mimetype) {
  if (!configured) return { url: `data:${mimetype};base64,${buffer.toString('base64')}`, publicId: null };

  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder: 'smartsplit/receipts', resource_type: 'image', type: 'authenticated' },
        (err, uploaded) => (err ? reject(err) : resolve(uploaded)),
      )
      .end(buffer);
  });

  return { url: signedReceiptUrl(result.public_id) ?? result.secure_url, publicId: result.public_id };
}

/** Fresh signed URL for a stored receipt — call at read time, never store the result. */
export function signedReceiptUrl(publicId) {
  if (!configured || !publicId) return null;

  return cloudinary.url(publicId, {
    type: 'authenticated',
    resource_type: 'image',
    secure: true,
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS,
  });
}
