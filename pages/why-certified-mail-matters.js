import Head from 'next/head';
import { useRouter } from 'next/router';

/**
 * REWRITTEN 5 Aug 2026 — this page used to be false for Florida.
 *
 * Its old thesis was: "Florida's deadline is receipt, not postmark, which is why we
 * file everything by USPS Certified Mail with Return Receipt." Both halves of that
 * were a problem. The first half is true. The second was not: a Florida VAB petition
 * leaves as a Lob CHECK (we pay the county filing fee) with the petition attached,
 * and Lob's check product only supports usps_first_class — certified is not offered
 * on it, and there is no return receipt. See pages/api/send-letter.js.
 *
 * So the page claimed "Every TaxAppeal filing goes via USPS Certified Mail with
 * Return Receipt" while being explicitly targeted at Florida homeowners, and it was
 * live in the sitemap.
 *
 * The honest version is still a good page: Florida's receipt rule is real, and the
 * way we manage it is by mailing early with tracking, not by buying a service that
 * does not exist on that product. Certified is genuinely used for TX/GA/AR/AL.
 *
 * The URL is deliberately unchanged — it has search history, and a rename would need
 * a redirect. Worth revisiting if the page is ever restructured.
 */

import { C } from "../lib/theme";
const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

export default function WhyCertifiedMail() {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>How to Make Sure Your Appeal Arrives On Time | TaxAppeal USA</title>
        <meta name="description" content="Property tax appeal deadlines are absolute. How to mail your appeal on time, get proof of mailing for about $2, and beat Florida's receipt rule." />
        <link rel="canonical" href="https://www.taxappealusa.com/why-certified-mail-matters" key="canonical" />
        {/* dangerouslySetInnerHTML, not a text child: React escapes ' & > in text and the client does not, so the two differ and hydration re-renders the whole root. See pages/apply.js. */}
        <style dangerouslySetInnerHTML={{ __html: FONT }} />
      </Head>
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh" }}>

        {/* Hero */}
        <div style={{ background: C.darkNavy, padding: "60px 24px 50px", textAlign: "center" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "inline-block", background: "rgba(255,201,64,0.15)", border: "1px solid rgba(255,201,64,0.3)", borderRadius: 20, padding: "6px 16px", marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: C.gold, letterSpacing: "1px", fontWeight: 600, textTransform: "uppercase" }}>Why It Matters</span>
            </div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: C.white, lineHeight: 1.2, margin: "0 0 20px" }}>How to Make Sure Your Appeal Arrives On Time</h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, margin: "0 0 32px" }}>Property tax deadlines are absolute. One day late means waiting a full year. With a TaxAppeal kit you sign and mail your appeal yourself, so here is how to get it there on time, with proof.</p>
            <button onClick={() => router.push('/apply')} style={{ background: C.gold, color: C.darkNavy, border: "none", borderRadius: 10, padding: "16px 36px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Check My Property -- Free</button>
          </div>
        </div>

        {/* State deadline pills */}
        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px", display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { state: "Texas", rule: "Postmark by May 15 or 30 days from notice", safe: true },
              { state: "Florida", rule: "RECEIVED within 25 days of TRIM notice", safe: false },
              { state: "Georgia", rule: "Postmark within 45 days of assessment notice", safe: true },
              { state: "Arkansas", rule: "Postmark by third Monday in August", safe: true },
              { state: "Alabama", rule: "File within 30 days of Notice of Valuation", safe: true },
            ].map(({ state, rule, safe }) => (
              <div key={state} style={{ background: safe ? C.lightBlue : "#FFF0F0", border: `1.5px solid ${safe ? C.border : "#FFCCCC"}`, borderRadius: 10, padding: "14px 20px", minWidth: 160, textAlign: "center" }}>
                <div style={{ fontWeight: 700, color: C.darkNavy, fontSize: 14, marginBottom: 6 }}>{state}</div>
                <div style={{ fontSize: 12, color: safe ? C.bodyGray : C.red, lineHeight: 1.5 }}>{rule}</div>
                {!safe && <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: C.red }}>Receipt required -- not postmark</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Content sections */}
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 24px" }}>
          {[
            { icon: "📅", heading: "The Deadline Is Absolute", body: "Property tax protest and appeal deadlines are not suggestions. In Texas, a protest not postmarked by May 15 (or 30 days from your notice, if later) is late. In Georgia you have 45 days from the date on your assessment notice. In Florida, a Value Adjustment Board petition not received within 25 days of your TRIM notice is dismissed as untimely. There is no appeal from missing an appeal deadline. You wait a year and pay the higher bill in the meantime." },
            { icon: "📬", heading: "Mail It the Day Your Kit Arrives", body: "Your kit comes with the form filled in, your evidence, a one-page checklist and a return envelope already addressed to the county. Read it, sign it in ink, add a stamp, and mail it that day. The checklist shows where to sign and the deadline for your county. Nothing gets better by waiting, and every day you hold it is a day of buffer you give away. We do not mail it to the county for you: you send it, in your own name, and the county writes back to you directly." },
            { icon: "🧾", heading: "Get Proof of Mailing for About $2", body: "Take the envelope to a post office counter rather than a street mailbox. A counter clerk can postmark it in front of you and give you a receipt. Better still, ask for a Certificate of Mailing (USPS PS Form 3817): it costs about $2 and is the post office's own record that you mailed it on that date. Keep it with your copy of the kit. If the county ever says your appeal arrived late, that slip is your proof." },
            { icon: "✉️", heading: "Georgia and Texas Count the Postmark", body: "In Georgia and Texas, an appeal or protest is on time if it is postmarked by the deadline, even if it reaches the county a few days later. That is why the postmark matters, and why a counter postmark or a Certificate of Mailing is worth the trip. Don't rely on a mailbox collection time on the last day: if the mail is collected after midnight, your postmark may carry the next day's date." },
            { icon: "⚠️", heading: "Florida Counts RECEIPT, Not the Postmark", body: "Most states accept a postmark as proof of timely filing. Florida does not. Your petition must be physically RECEIVED by the Value Adjustment Board within 25 days of the date your TRIM notice was mailed. Dropping it in a mailbox on day 24 is not enough -- if it lands on the clerk's desk on day 26, it is late. Mail it the day your kit arrives, and if the deadline is close, hand-deliver it to the Clerk of the Value Adjustment Board instead. Remember to put your own cheque for the county's filing fee in the envelope: in Florida that fee is paid by you, to the county, and is not part of our $89." },
            { icon: "💻", heading: "Filing Online Is Fine Where Your County Offers It", body: "Many appraisal districts in Texas, and some counties elsewhere, accept protests and appeals online. If yours does, you can use it: a PDF copy of the full kit is also emailed to you the same day, so you can upload the completed form and your evidence. Save or screenshot the confirmation page. Close to a deadline there isn't time to mail you a printed kit, so we email it as a PDF only: print it, sign it and mail it, or file it online." },
          ].map(({ icon, heading, body }, i) => (
            <div key={i} style={{ marginBottom: 48 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 32, flexShrink: 0 }}>{icon}</div>
                <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, margin: 0, lineHeight: 1.3 }}>{heading}</h2>
              </div>
              <p style={{ fontSize: 16, color: C.bodyGray, lineHeight: 1.8, margin: 0, paddingLeft: 48 }}>{body}</p>
            </div>
          ))}

          {/* Comparison table */}
          <div style={{ background: C.lightBlue, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 32, marginBottom: 48 }}>
            <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, margin: "0 0 20px" }}>Starting From Scratch vs. a TaxAppeal Kit</h3>
            {[
              ["The official form", "You find it and fill it in", "Filled in for your home"],
              ["Evidence", "You find comparable homes yourself", "Included, ready to send"],
              ["Where to send it", "You look up the right office", "Return envelope addressed to the county"],
              ["Your deadline", "You work it out", "Printed on your checklist"],
              ["Will it lower your bill?", "You find out later", "We check first, before you pay"],
              ["A PDF copy", "Not applicable", "Emailed to you the same day"],
            ].map(([label, diy, ta], idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: idx < 5 ? `1px solid ${C.border}` : "none", fontSize: 13 }}>
                <div style={{ color: C.darkNavy, fontWeight: 600 }}>{label}</div>
                <div style={{ color: C.red }}>No -- {diy}</div>
                <div style={{ color: C.green, fontWeight: 500 }}>Yes -- {ta}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ background: C.navy, borderRadius: 16, padding: "40px 36px", textAlign: "center" }}>
            <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.white, margin: "0 0 12px" }}>Get Your Appeal Kit for $89</h3>
            <p style={{ color: "rgba(255,255,255,0.75)", margin: "0 0 28px", fontSize: 15, lineHeight: 1.7 }}>We check whether an appeal will actually lower your tax bill, after caps and exemptions, before you pay. If it won't, we'll tell you, and we won't sell you one. If it will, we mail you a ready-to-sign kit: you sign it and mail it.</p>
            <button onClick={() => router.push('/apply')} style={{ background: C.gold, color: C.darkNavy, border: "none", borderRadius: 10, padding: "16px 40px", fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>Check My Property -- Free</button>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>TX &middot; FL &middot; GA &middot; AR &middot; AL &nbsp;&bull;&nbsp; No subscription &bull; No percentage cut</div>
          </div>
        </div>
      </div>
    </>
  );
}
