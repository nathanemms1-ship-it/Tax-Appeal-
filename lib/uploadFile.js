/**
 * lib/uploadFile.js — photos and PDFs customers send us (17 Oct 2026).
 *
 * Shared by the decision-letter upload (pages/api/kit/outcome.js) and the
 * notice photo (pages/api/kit/read-notice.js). Server side: cleanUploadFile
 * checks the declared type, the size and that the bytes really are that type.
 * Browser side: lib/uploadClient.js prepareUpload shrinks a phone photo.
 */
export const UPLOAD_TYPES = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' });
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Returns { mediaType, base64, bytes } or { error: 'type'|'empty'|'size' }. */
export function cleanUploadFile(file) {
  const mediaType = String(file?.type || '').toLowerCase();
  if (!UPLOAD_TYPES[mediaType]) return { error: 'type' };
  const base64 = String(file?.data || '').replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) return { error: 'type' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 1000) return { error: 'empty' };
  if (bytes.length > MAX_UPLOAD_BYTES) return { error: 'size' };
  // The bytes must be what the type says: a renamed file is not read.
  const magic = bytes.subarray(0, 4).toString('hex');
  const ok = (mediaType === 'application/pdf' && bytes.subarray(0, 4).toString() === '%PDF')
    || (mediaType === 'image/jpeg' && magic.startsWith('ffd8'))
    || (mediaType === 'image/png' && magic === '89504e47')
    || (mediaType === 'image/webp' && bytes.subarray(8, 12).toString() === 'WEBP');
  if (!ok) return { error: 'type' };
  return { mediaType, base64: bytes.toString('base64'), bytes };
}
