/**
 * Why a waitlist row exists, as an allow-list.
 *
 * A row in `waitlist` is a promise to email somebody, and the reason decides WHICH
 * promise. Getting that wrong is not a cosmetic bug: it sends a specific person a
 * specific message contradicting what the site already told them.
 *
 * This lives in lib/ rather than inside pages/api/join-waitlist.js because two
 * files must agree about it — the endpoint that WRITES the reason and the cron
 * that READS it. They did not. `fl_no_parcel_record` was an accepted reason with
 * no branch in notify-waitlist.js, so those rows fell through to the ordinary
 * "your filing window just opened, file today" email, aimed at people the funnel
 * had already refused and would refuse again the moment they clicked.
 *
 * scripts/verify-emails.mjs fails the build if a reason here has no branch there.
 * Adding a reason is therefore a two-file change by construction.
 */

export const WAITLIST_BLOCKED_REASONS = [
  // Refused at the funnel: their county's VAB address or fee is unconfirmed, so a
  // petition could not be filed even if they paid. Owed exactly one email — "your
  // county is confirmed and there is still time" — or, at season's end, "we could
  // not". Handled explicitly in notify-waitlist.js.
  'fl_county_unconfirmed',

  // Refused at the funnel: no parcel on the current DOR roll. New construction, a
  // recent split, or a bad address. Nothing we can tell them on 24 August changes
  // that, and the funnel refuses them again if they act on it. Never emailed by
  // the reminder track.
  'fl_no_parcel_record',

  // NOT refused — correctly served. /check told them, truthfully, that an appeal
  // would not lower their bill, because their Save Our Homes capped assessment
  // already sits below market value. They then asked to hear when that changes.
  //
  // "When that changes" means their county's just value falling toward their
  // capped value. It does NOT mean the filing window opening, which is the only
  // thing the reminder track knows how to say. Sending them "file today, $89"
  // would point them at a purchase that saves them nothing — the precise outcome
  // pages/check.js exists to prevent. Never emailed by the reminder track until
  // something computes the trigger they were actually promised.
  'fl_not_eligible',
];

export default WAITLIST_BLOCKED_REASONS;
