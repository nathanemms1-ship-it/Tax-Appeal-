/**
 * INPUT SIZE LIMITS for anything that reaches a metered vendor.
 *
 * ============================================================================
 * WHY THIS IS THE HIGHEST-VALUE COST CONTROL IN THE APP
 * ============================================================================
 * lib/rateLimit.js counts REQUESTS. Anthropic bills TOKENS. Those two facts were
 * not reconciled anywhere, and the gap was large.
 *
 * The rate limits were sized on the assumption of "~2-4k tokens per call" — see
 * the header of rateLimit.js. But `notes`, `propertyDetails` and `issues` were
 * interpolated straight into the prompts in generate-letter, generate-dr486 and
 * generate-pt311a with NO length validation anywhere. Next's default body limit is
 * 1 MB, which is roughly 190k input tokens — Sonnet's context ceiling. So a single
 * HTTP request could carry ~$0.57 of input, about 150x what the limits assumed.
 *
 * 8 requests per minute of 4k tokens is a rounding error. 8 requests per minute of
 * 190k tokens is a real bill. Capping the input is what makes the request limits
 * mean what their comments claim.
 *
 * This also closes the practical half of a prompt-injection surface: a 2,000
 * character note is a much smaller canvas for instructions than a megabyte.
 *
 * Limits are generous against real use. A homeowner describing every defect in a
 * house does not write 2,000 characters, and the funnel's own textarea is far
 * smaller. Anything above these is a script, not a customer.
 */

export const LIMITS = {
  address: 200,
  county: 120,
  name: 100,
  email: 254,          // RFC 5321 maximum
  phone: 40,
  parcelId: 60,
  notes: 2000,
  propertyDetails: 2000,
  evidenceText: 20000, // reused on the signing pass, so this is our own output
  issueItem: 200,
  issueCount: 25,
  signatureName: 120,
};

/** Coerce to string and hard-truncate. Never throws. */
export function cap(value, max) {
  if (value === null || value === undefined) return value;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Body-size ceiling for routes that build a prompt. 64 KB is far above any real
 * submission and far below the 1 MB default that made a $0.57 request possible.
 * Import and re-export as `config` from each such route.
 */
export const PROMPT_ROUTE_CONFIG = {
  api: { bodyParser: { sizeLimit: '64kb' } },
};

