/**
 * lib/kit/noticeLink.js — the private link a pre-sale customer uses to enter
 * their notice (16 Oct 2026).
 *
 * The link carries the order id and an HMAC of it under INTERNAL_API_SECRET, so
 * it works without a password and cannot be forged for someone else's order.
 * It only ever lets the holder enter a notice for that one order, which is the
 * thing the receipt and the reminders are asking them to do.
 */
import crypto from 'crypto';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.taxappealusa.com';

export function noticeToken(orderId, secret = process.env.INTERNAL_API_SECRET || '') {
  if (!secret || !orderId) return null;
  return crypto.createHmac('sha256', secret).update(`kit-notice:${orderId}`).digest('hex').slice(0, 40);
}

export function noticeUrl(orderId, secret) {
  const t = noticeToken(orderId, secret);
  return t ? `${BASE_URL}/kit/notice?o=${encodeURIComponent(orderId)}&t=${t}` : null;
}

export function checkNoticeToken(orderId, token, secret = process.env.INTERNAL_API_SECRET || '') {
  const want = noticeToken(orderId, secret);
  if (!want || typeof token !== 'string' || token.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(token));
}
