/**
 * EVERY COLUMN THE CODE WRITES TO `orders`.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * Three columns went missing in two days:
 *
 *   account_number   5 Aug — the order INSERT threw after payment was captured.
 *                    Live checkout was broken and the customer sat on a spinner.
 *   evidence_text    6 Aug — would have done exactly the same had the migration
 *                    not been run in the same sitting as the deploy.
 *   delivered_at     6 Aug — the Lob webhook writes it; a missing column makes the
 *                    update fail silently in a log nobody reads.
 *
 * Every one of them was invisible to everything we had. The build passed. All
 * seventeen suites passed. /api/health reported the database as reachable, because
 * reachable is all it checked. The code and the schema disagreed and no layer of the
 * system could see it.
 *
 * ============================================================================
 * HOW THIS IS KEPT HONEST
 * ============================================================================
 * A hardcoded list rots — someone adds a write, forgets the list, and the guard
 * quietly stops guarding. So it is enforced from both ends:
 *
 *   scripts/verify-schema.mjs  parses the source for every column written to
 *                              `orders` and fails the BUILD if it finds one that is
 *                              not listed here. The list cannot fall behind the code.
 *
 *   checkSchema() in           asks Postgres, at runtime, whether every column below
 *   lib/healthChecks.js        actually exists. The database cannot fall behind the
 *                              list. Runs every 10 minutes with the health monitor.
 *
 * Together: code -> list -> database, with a failing build at the first hop and a
 * critical alert at the second.
 *
 * ADDING A COLUMN: write the migration FIRST, run it against the database, then
 * deploy the code. In that order the worst case is a column nobody uses yet. In the
 * other order the worst case is a customer paying for nothing.
 */

export const ORDER_WRITE_COLUMNS = [
  // Identity and contact
  'customer_name', 'customer_email', 'password_hash',

  // Property
  'property_address', 'county', 'state', 'state_code',
  // The parcel/folio number. Named account_number because the inbound decision
  // parser matches county letters on it. `orders.parcel_id` also exists and is dead —
  // nothing reads or writes it.
  'account_number',
  'assessed_value', 'market_value', 'target_reduction', 'reduction_pct',

  // Owner mailing address
  'owner_street', 'owner_city', 'owner_state', 'owner_zip',

  // Money
  'amount_paid', 'payment_status', 'estimated_savings', 'actual_savings',
  'savings_amount', 'stripe_session_id', 'vab_fee', 'vab_payable_to',

  // The petition itself
  'letter_text',
  // The evidence section, stored so /api/finalize-order can rebuild the petition
  // WITH the signature instead of generating a different document. Losing this is
  // how comps and reported defects went missing between purchase and filing.
  'evidence_text',

  // Signature — the DR-486 Part 3 attestation, sworn under penalty of perjury
  'signature_image', 'signature_typed_name', 'signed_at', 'signer_ip', 'owner_ack',
  'fl_signature_name', 'fl_auth_date', 'fl_will_not_attend', 'fl_authorize_confidential',

  // Lifecycle and dispatch
  'dispute_status', 'scheduled_file_date',
  'lob_letter_id', 'lob_status', 'lob_tracking_number',
  'mailed_at',
  // Written by pages/api/lob-webhook.js on check.delivered. Without it, transit time
  // cannot be measured at all — the row knows a piece arrived but not when.
  'delivered_at',

  // Non-Florida appraisal district
  'district_name', 'district_address', 'district_city', 'district_state', 'district_zip',

  // County decision, parsed from inbound mail
  'decision_date', 'decision_detail', 'raw_email_content',

  // Referrals
  'ref_code',

  // Dispatch failure record, written by cron/process-queued-orders.js.
  // Added 11 Aug 2026 with scripts/sql/orders_dispatch_failure.sql. Before these
  // existed a failed dispatch was a console.error and nothing else: the order stayed
  // `queued`, retried hourly, and looked identical in /admin to one simply waiting
  // for its window to open. `dispatch_attempts` is also what stops a permanently
  // failing order being retried at the head of the queue forever.
  'dispatch_attempts', 'last_dispatch_error',
];

export default ORDER_WRITE_COLUMNS;
