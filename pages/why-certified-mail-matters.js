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

const C = { navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC", lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF", border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52" };
const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

export default function WhyCertifiedMail() {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>How We Make Sure Your Appeal Arrives On Time | TaxAppeal USA</title>
        <meta name="description" content="Property tax appeal deadlines are absolute, and Florida requires RECEIPT within 25 days -- not postmark. Here is exactly how we mail your filing in each state, and why we send it early." />
        <link rel="canonical" href="https://www.taxappealusa.com/why-certified-mail-matters" key="canonical" />
        <style>{FONT}</style>
      </Head>
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh" }}>

        {/* Hero */}
        <div style={{ background: C.darkNavy, padding: "60px 24px 50px", textAlign: "center" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "inline-block", background: "rgba(255,201,64,0.15)", border: "1px solid rgba(255,201,64,0.3)", borderRadius: 20, padding: "6px 16px", marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: C.gold, letterSpacing: "1px", fontWeight: 600, textTransform: "uppercase" }}>Why It Matters</span>
            </div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: C.white, lineHeight: 1.2, margin: "0 0 20px" }}>How We Make Sure Your Appeal Arrives On Time</h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, margin: "0 0 32px" }}>Property tax deadlines are absolute. One day late means waiting a full year. We mail every filing with USPS tracking, and we send it days before your deadline rather than on it.</p>
            <button onClick={() => router.push('/apply')} style={{ background: C.gold, color: C.darkNavy, border: "none", borderRadius: 10, padding: "16px 36px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Start My Appeal -- $89 Flat</button>
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
                <div style={{ fontSize: 12, color: safe ? C.bodyGray : "#C0392B", lineHeight: 1.5 }}>{rule}</div>
                {!safe && <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: "#C0392B" }}>Receipt required -- not postmark</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Content sections */}
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "60px 24px" }}>
          {[
            { icon: "📅", heading: "The Deadline Is Absolute", body: "Property tax protest and appeal deadlines are not suggestions. In Texas, a protest not filed by May 15 (or 30 days from your notice) is void -- no exceptions. In Florida, a VAB petition not received within 25 days of your TRIM notice is dismissed as untimely. There is no appeal from missing an appeal deadline. You wait a year and pay the higher bill in the meantime." },
            { icon: "⚠️", heading: "The Florida Receipt Trap", body: "Most states accept a postmark as proof of timely filing. Florida does not. Your VAB petition must be physically RECEIVED by the Clerk of the Value Adjustment Board within 25 days of the date your TRIM notice was mailed. Dropping it in a mailbox on day 24 is not enough -- if it lands on the clerk's desk on day 26, it is late. This single difference catches more Florida homeowners than any other rule." },
            { icon: "📬", heading: "How We Mail It, State By State", body: "In Texas, Georgia, Arkansas and Alabama we send your signed protest by USPS Certified Mail, which assigns a tracking number and creates a record that it was sent and received. Florida works differently: your petition goes out attached to a cheque we write for your county's filing fee, and USPS carries that as tracked First Class mail -- certified service is not offered on that product. You get tracking in every state; the class of service differs because the mail piece does." },
            { icon: "🗓️", heading: "Why We Mail Early, Not On Time", body: "Because Florida's rule is receipt rather than postmark, the only reliable protection is time. We aim to have your petition in the post 7 to 10 days before your deadline, so ordinary postal variation cannot cost you the year. That buffer -- not a particular class of postage -- is what actually keeps a Florida filing safe. In the postmark states the buffer matters less, but we build it in anyway." },
            { icon: "✅", heading: "What You Get From Us", body: "We prepare the filing, you read and sign it, and we put it in the mail in your name. We pay your county's filing fee where one is charged. We email you when it is dispatched, with the tracking details we hold, and again when the carrier reports it delivered. If your county's Value Adjustment Board details are not yet confirmed with the county, we tell you before you pay -- and refund you in full, filing fee included, if we cannot get it filed before your deadline." },
            { icon: "💡", heading: "The $40 Difference", body: "The gap between TaxAppeal ($89) and a DIY packet service like AppealDesk ($49) is $40. That $40 covers the postage, the address verification, the county filing fee handling, and the deadline management -- somebody else watching the calendar and getting to the post office early. If you would rather do that yourself, a DIY packet is a perfectly reasonable choice. The $40 buys the part most people forget." },
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
            <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, margin: "0 0 20px" }}>DIY Filing vs. TaxAppeal</h3>
            {[
              ["Who mails it", "You -- post office trip required", "We do -- postage included"],
              ["Postage", "You buy it separately", "Included in $89"],
              ["Tracking", "Only if you paid for it", "Always, and we email it to you"],
              ["County filing fee", "You pay and manage it", "We pay it for you"],
              ["Deadline risk", "Yours -- if late, appeal is void", "Ours -- we mail 7-10 days early"],
              ["Florida receipt rule", "Your responsibility", "We build in a buffer so it arrives in time"],
            ].map(([label, diy, ta], idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: idx < 5 ? `1px solid ${C.border}` : "none", fontSize: 13 }}>
                <div style={{ color: C.darkNavy, fontWeight: 600 }}>{label}</div>
                <div style={{ color: "#C0392B" }}>No -- {diy}</div>
                <div style={{ color: C.green, fontWeight: 500 }}>Yes -- {ta}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ background: C.navy, borderRadius: 16, padding: "40px 36px", textAlign: "center" }}>
            <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: C.white, margin: "0 0 12px" }}>File the Safe Way for $89</h3>
            <p style={{ color: "rgba(255,255,255,0.75)", margin: "0 0 28px", fontSize: 15, lineHeight: 1.7 }}>We draft your filing, you sign it, and we mail it for you with tracking -- days before your deadline. No post office. No deadline stress.</p>
            <button onClick={() => router.push('/apply')} style={{ background: C.gold, color: C.darkNavy, border: "none", borderRadius: 10, padding: "16px 40px", fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>Start My Appeal -- $89 Flat</button>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>TX &middot; FL &middot; GA &middot; AR &middot; AL &nbsp;&bull;&nbsp; No subscription &bull; No percentage cut</div>
          </div>
        </div>
      </div>
    </>
  );
}
