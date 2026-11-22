import sharp from 'sharp';
import { badRequest } from '../lib/errors.js';
export async function prepareChatImage(buffer) {
  if (!buffer?.length || buffer.length > 5 * 1024 * 1024) throw badRequest('Envie uma foto de até 5 MB.');
  try {
    const image = sharp(buffer, { limitInputPixels: 20000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error();
    const data = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    if (data.length > 2 * 1024 * 1024) throw new Error();
    return { data, mime: 'image/webp' };
  } catch { throw badRequest('Foto inválida. Use JPG, PNG ou WebP estático, com até 20 milhões de pixels.'); }
}
