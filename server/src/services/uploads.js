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

/**
 * Uploads a receipt image and returns its URL.
 * ponytail: with no Cloudinary account configured the image is inlined as a
 * data URL so the whole flow still runs offline for the demo. Configure
 * CLOUDINARY_* before deploying.
 */
export async function uploadReceiptImage(buffer, mimetype) {
  if (!configured) return `data:${mimetype};base64,${buffer.toString('base64')}`;

  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: 'smartsplit/receipts', resource_type: 'image' }, (err, result) =>
        err ? reject(err) : resolve(result.secure_url),
      )
      .end(buffer);
  });
}
