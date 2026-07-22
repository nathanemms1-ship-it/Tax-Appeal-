// lib/filingWindows.js
//
// Single source of truth for state/county property-tax filing-window dates.
// Imported by pages/apply.js (customer-facing gate), pages/api/cron/notify-waitlist.js
// (waitlist notifications), and pages/api/cron/process-queued-orders.js (pre-order
// fulfillment). Before this file existed, apply.js and notify-waitlist.js each had
// their own copy and had already drifted (FL open date Aug 11 vs Aug 15, and AR/AL
// were missing entirely from the cron's copy). Change dates in exactly one place.

export const FILING_WINDOWS = {
  TX: { openMonth: 4, openDay: 1, closeMonth: 5, closeDay: 31, hardMonth: 5, hardDay: 15, minDays: 3, receiptRequired: false },
  GA: {
    openMonth: 4, openDay: 1, closeMonth: 7, closeDay: 15, hardMonth: 7, hardDay: 15, minDays: 3, receiptRequired: false,
    countyWindows: {
      "Fulton":   { openMonth: 5, openDay: 1,  closeMonth: 7, closeDay: 15 },
      "Cobb":     { openMonth: 5, openDay: 15, closeMonth: 7, closeDay: 15 },
      "Gwinnett": { openMonth: 4, openDay: 1,  closeMonth: 6, closeDay: 15 },
      "DeKalb":   { openMonth: 4, openDay: 1,  closeMonth: 6, closeDay: 1  },
      "Cherokee": { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Forsyth":  { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Hall":     { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Henry":    { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Chatham":  { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Richmond": { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Columbia": { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Clayton":  { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Muscogee": { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Bibb":     { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Houston":  { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Douglas":  { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Coweta":   { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Fayette":  { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Paulding": { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Lowndes":  { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Bartow":   { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Clarke":   { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Jackson":  { openMonth: 4, openDay: 15, closeMonth: 6, closeDay: 15 },
      "Walton":   { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Newton":   { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
      "Rockdale": { openMonth: 5, openDay: 1,  closeMonth: 6, closeDay: 30 },
    },
  },
  AR: { openMonth: 6, openDay: 1, closeMonth: 8, closeDay: 10, hardMonth: 8, hardDay: 17, minDays: 7, receiptRequired: false },
  FL: { openMonth: 8, openDay: 11, closeMonth: 9, closeDay: 18, hardMonth: 9, hardDay: 18, minDays: 10, receiptRequired: true },
  AL: { openMonth: 4, openDay: 1, closeMonth: 8, closeDay: 17, hardMonth: 8, hardDay: 17, minDays: 7, receiptRequired: false },
};

// How many days before a window opens we start accepting "reserve your spot"
// pre-orders. Nathan's call (July 2026): 60 days — short enough that comps/
// assessed-value data won't go stale, long enough to smooth lead capture
// ahead of each state's season.
export const PRE_ORDER_DAYS = 60;

export function getFilingWindowStatus(stateCode, countyName) {
  const fw = FILING_WINDOWS[stateCode];
  if (!fw) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();

  let openMonth = fw.openMonth, openDay = fw.openDay, closeMonth = fw.closeMonth, closeDay = fw.closeDay;
  if (stateCode === "GA" && countyName && fw.countyWindows) {
    const countyClean = countyName.replace(/ County$/i, "").trim();
    const cw = Object.entries(fw.countyWindows).find(([k]) => k.toLowerCase() === countyClean.toLowerCase())?.[1];
    if (cw) { openMonth = cw.openMonth; openDay = cw.openDay; closeMonth = cw.closeMonth; closeDay = cw.closeDay; }
    else { closeMonth = 6; closeDay = 15; } // unknown GA county — fall back to full statewide window
  }

  let openDate = new Date(year, openMonth - 1, openDay);
  let closeDate = new Date(year, closeMonth - 1, closeDay);
  let hardDeadline = new Date(year, fw.hardMonth - 1, fw.hardDay);
  if (today > closeDate) {
    openDate = new Date(year + 1, openMonth - 1, openDay);
    closeDate = new Date(year + 1, closeMonth - 1, closeDay);
    hardDeadline = new Date(year + 1, fw.hardMonth - 1, fw.hardDay);
  }

  const preOrderOpenDate = new Date(openDate);
  preOrderOpenDate.setDate(preOrderOpenDate.getDate() - PRE_ORDER_DAYS);

  const isOpen = today >= openDate && today <= closeDate;
  const daysUntilOpen = !isOpen ? Math.ceil((openDate - today) / (1000 * 60 * 60 * 24)) : 0;
  const daysUntilClose = isOpen ? Math.ceil((closeDate - today) / (1000 * 60 * 60 * 24)) : 0;
  const daysUntilHard = isOpen ? Math.ceil((hardDeadline - today) / (1000 * 60 * 60 * 24)) : 0;
  const tooClose = isOpen && daysUntilHard < fw.minDays;
  const canFile = isOpen && !tooClose;

  // Pre-order window: PRE_ORDER_DAYS before openDate, through closeDate.
  // Not subject to `tooClose` — a pre-order taken now files the moment the
  // window opens, long before any deadline risk.
  const canPreOrder = !isOpen && today >= preOrderOpenDate && today <= closeDate;
  const daysUntilPreOrder = !canPreOrder && !isOpen ? Math.ceil((preOrderOpenDate - today) / (1000 * 60 * 60 * 24)) : 0;

  const isFirstDay = today.getTime() === openDate.getTime();
  const urgency = !isOpen ? "closed" : daysUntilClose <= 7 ? "critical" : daysUntilClose <= 14 ? "urgent" : daysUntilClose <= 30 ? "warning" : "normal";

  return {
    isOpen, canFile, canPreOrder, isFirstDay,
    daysUntilOpen, daysUntilPreOrder, daysUntilClose, daysUntilHard,
    tooClose, urgency, receiptRequired: fw.receiptRequired,
    openDate, closeDate, preOrderOpenDate,
  };
}
