import Head from 'next/head';
import { useRouter } from 'next/router';

const C = { navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC", lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF", border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52" };
const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

export default function WhyCertifiedMail() {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>Why Certified Mail Matters for Property Tax Appeals | TaxAppeal USA</title>
        <meta name="description" content="Property tax appeal deadlines are strict. Florida requires RECEIPT within 25 days -- not postmark. Learn why certified mail with return receipt is the only safe way to file." />
        <link rel="canonical" href="https://www.taxappealusa.com/why-certified-mail-matters" />
        <style>{FONT}</style>
      </Head>
      <div style={{ fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh" }}>

        {/* Hero */}
        <div style={{ background: C.darkNavy, padding: "60px 24px 50px", textAlign: "center" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "inline-block", background: "rgba(255,201,64,0.15)", border: "1px solid rgba(255,201,64,0.3)", borderRadius: 20, padding: "6px 16px", marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: C.gold, letterSpacing: "1px", fontWeight: 600, textTransform: "uppercase" }}>Why It Matters</span>
            </div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 40, color: C.white, lineHeight: 1.2, margin: "0 0 20px" }}>Why We File by Certified Mail</h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, margin: "0 0 32px" }}>Property tax deadlines are absolute. One day late means waiting a full year. USPS Certified Mail with Return Receipt is the only way to prove your protest was filed on time.</p>
            <button onClick={() => router.push('/apply')} style={{ background: C.gold, color: C.darkNavy, border: "none", borderRadius: 10, padding: "16px 36px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>File Your Appeal -- $89 Flat &rarr;</button>
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
            { icon: "📅", heading: "The Deadline Is Absolute", body: "Property tax protest and appeal deadlines are not suggestions. In Texas, a protest not filed by May 15 (or 30 days from your notice) is void -- no exceptions. In Florida, a VAB petition not RECEIVED within 25 days of your TRIM notice is rejected -- no exceptions. Miss the deadline by one day and you pay inflated taxes for an entire year before you can try again." },
            { icon: "⚠️", heading: "The Florida Receipt Trap", body: "Most states accept a postmark as proof of timely filing. Florida does not. Your VAB petition must be physically RECEIVED by the VAB Clerk within 25 days of your TRIM notice mailing date. If USPS delivers it on day 26 -- even if you mailed it on day 20 -- it is rejected with no exceptions. This is the single biggest risk in DIY Florida property tax filing." },
            { icon: "📬", heading: "What Certified Mail Actually Does", body: "USPS Certified Mail assigns a unique tracking number to your letter and creates a chain of custody from the moment it is accepted at the post office. Return Receipt goes further -- it generates a record signed by the recipient at the destination, documenting the exact date your letter was received. This is legal proof of timely delivery that cannot be disputed." },
            { icon: "❌", heading: "What Happens Without Certified Mail", body: "If you mail your protest in a regular envelope with a stamp, you have no tracking, no proof of mailing, and no proof of receipt. If the letter gets lost, delayed, or misrouted -- your protest never happened. The appraisal district has no obligation to follow up. You simply do not receive a hearing and your assessment stands for the full year." },
            { icon: "✅", heading: "How TaxAppeal Handles This", body: "Every TaxAppeal filing goes via USPS Certified Mail with Return Receipt. After we mail your letter, you receive a confirmation email with your tracking number. The Return Receipt creates documented proof of the exact date your protest was received. If there is ever a dispute about timing, you have legal evidence. You never had to go to the post office." },
            { icon: "💡", heading: "The $40 That Eliminates the Risk", body: "The difference between TaxAppeal ($89) and a DIY packet service like AppealDesk ($49) is $40. That $40 pays for certified mail, return receipt, address verification, and the deadline risk you no longer carry. For a protest that could save $1,000-$3,000 in annual property taxes, the $40 is the cheapest insurance policy available." },
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
              ["Who mails it", "You -- post office trip required", "We do -- certified mail included"],
              ["Certified Mail", "You buy it separately", "Included in $89"],
              ["Proof of receipt", "None unless you pay extra", "Return Receipt included"],
              ["Tracking number", "Only if you paid for it", "Emailed to you automatically"],
              ["Deadline risk", "Yours -- if late, appeal is void", "Ours -- we manage it"],
              ["Florida receipt rule", "Your responsibility", "We ensure receipt, not just postmark"],
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
            <p style={{ color: "rgba(255,255,255,0.75)", margin: "0 0 28px", fontSize: 15, lineHeight: 1.7 }}>We draft your letter, mail it via USPS Certified Mail with Return Receipt, and send you the tracking number. No post office. No deadline stress.</p>
            <button onClick={() => router.push('/apply')} style={{ background: C.gold, color: C.darkNavy, border: "none", borderRadius: 10, padding: "16px 40px", fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>Start My Appeal -- $89 Flat &rarr;</button>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>TX &middot; FL &middot; GA &middot; AR &middot; AL &nbsp;&bull;&nbsp; No subscription &bull; No percentage cut</div>
          </div>
        </div>
      </div>
    </>
  );
}
