/**
 * Site-wide "not filing yet" banner, rendered from _app.js on every page while
 * sales are paused.
 *
 * WHY A BANNER RATHER THAN EDITING THE PAGES
 * ------------------------------------------
 * 200+ marketing pages carry filing calls to action — "File My Miami Appeal",
 * "Reserve your Florida spot now", deadline countdowns. Rewriting all of them is
 * a large blind edit across templates whose heroes have been deleted by exactly
 * that kind of change before (round 6). One banner, rendered above everything,
 * corrects the framing on every page at once and reverts cleanly the day sales
 * reopen: set SALES_ENABLED=true, redeploy, and it disappears everywhere.
 *
 * It is deliberately a real banner and not a dismissible toast. Someone who
 * lands on /miami from a search result should learn we are not filing yet before
 * they read a page that says "File My Miami Appeal — $104 All-In".
 *
 * The one countdown that had to be edited anyway is on /florida, which said
 * "Lock in the $89 rate today" — a banner cannot soften a sentence that specific.
 */
export default function WaitlistBanner() {
  if (process.env.NEXT_PUBLIC_SALES_ENABLED === 'true') return null;

  return (
    <div
      role="status"
      style={{
        background: '#0F1F3D',
        color: '#FFFFFF',
        padding: '11px 20px',
        fontSize: 14,
        lineHeight: 1.5,
        textAlign: 'center',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <strong style={{ color: '#FFC940' }}>We&apos;re not filing yet.</strong>{' '}
      TaxAppeal USA is finishing county verification before taking any orders.{' '}
      <a
        href="/apply"
        style={{ color: '#FFFFFF', textDecoration: 'underline', fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        Join the waitlist →
      </a>
    </div>
  );
}
