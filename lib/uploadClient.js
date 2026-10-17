/**
 * lib/uploadClient.js — the browser half of lib/uploadFile.js (17 Oct 2026).
 * Kept separate so no Node-only code reaches the page bundle.
 */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Browser only. A phone photo is often 5-10 MB: shrink it to a JPEG under the limit. PDFs go as they are. */
export async function prepareUpload(file) {
  const asBase64 = (blob) => new Promise((ok, bad) => { const r = new window.FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = bad; r.readAsDataURL(blob); });
  if (file.type === 'application/pdf') {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('That PDF is too large. Please upload one under 3 MB, or a photo instead.');
    return { type: 'application/pdf', data: await asBase64(file) };
  }
  if (!/^image\//.test(file.type)) throw new Error('Please choose a photo or a PDF.');
  const url = window.URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new window.Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('We could not open that photo. Please try another, or a PDF.')); i.src = url; });
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = window.document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
    return { type: 'image/jpeg', data: await asBase64(blob) };
  } finally { window.URL.revokeObjectURL(url); }
}
