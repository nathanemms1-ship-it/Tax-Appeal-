import Head from 'next/head';
import { breadcrumbSchema } from '../lib/breadcrumbs';
import { useState } from 'react';
import { useRouter } from 'next/router';

const C = { navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",lightBlue:"#EEF3FB",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF",green:"#2E7D52" };
const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const faqs = [
["How do I appeal my Tampa property taxes?","File a VAB petition with the Hillsborough County Value Adjustment Board within 25 days of your TRIM notice. TaxAppeal mails your petition at least 7 days early to ensure receipt by Florida's strict deadline."],
["What is the county filing fee?","Florida House Bill 7031 (effective July 2025) requires a mandatory filing fee paid to the Hillsborough County Value Adjustment Board. Hillsborough's rate is $50 (the state maximum). TaxAppeal pays this fee on your behalf — it's included in your $139 total. You don't need to make a separate payment."],
["What is the Hillsborough County Property Appraiser?","The Hillsborough County Property Appraiser determines assessed values for all properties in Hillsborough County including Tampa, Brandon, Plant City, and surrounding areas."],
["How much can Tampa homeowners save?","Your saving is the size of the reduction multiplied by your local tax rate, so it depends entirely on your own property — and where an assessment cap absorbs the reduction, it can be nothing at all. Our free check tells you which applies to you before you pay. At $139 all-in, a successful appeal pays for itself within the first three weeks of savings."],
["What is the Tampa property tax appeal deadline?","25 days after your TRIM notice is mailed, typically mid-September. Florida requires RECEIPT by this date — not just postmark. TaxAppeal files 7+ days early to protect you."],
["Does TaxAppeal serve all Hillsborough County cities?","Yes. We serve Tampa, Brandon, Plant City, Riverview, Valrico, Lithia, and every other city in Hillsborough County."]
];

/**
 * THE FILING WINDOW DATES ARE DERIVED, NOT TYPED. 11 Aug 2026.
 *
 * This page carried `windowOpen = new Date('2026-08-11')`. lib/filingWindows.js
 * moved Florida to 24 Aug — because filing before TRIM notices exist produces
 * premature petitions against the prior year's assessed value — and this hardcoded
 * copy never followed. From 11 Aug the banner read "Florida's filing window is
 * open, file before your county's 25-day deadline" and linked to /apply, while
 * pages/apply.js refused anything but a pre-order for another thirteen days.
 *
 * The templated city pages (pages/florida/[city].js) were corrected on 10 Aug.
 * These five hand-written metro pages were missed, and they have zero inbound
 * internal links, so nothing pointed at them to notice.
 *
 * Now from FILING_WINDOWS.FL, the same table the checkout gate reads.
 * scripts/verify-pages.mjs asserts it.
 */
export async function getStaticProps() {
  const { FILING_WINDOWS } = await import('../lib/filingWindows');
  /**
   * THE PETITION DOES NOT GO TO THE PROPERTY APPRAISER, AND THIS PAGE SAID IT DID.
   *
   * The contact card below carried the Property Appraiser's street address, phone
   * number and website under a heading about filing. lib/flVabAddresses.js opens
   * with the reason that is not a cosmetic error: a DR-486 mailed to the Property
   * Appraiser is never filed, and the owner loses the appeal year with no recovery,
   * because Florida's deadline is satisfied by physical receipt.
   *
   * Our own dispatch was always correct — send-letter.js reads this same table. It
   * was the page telling a homeowner who decided to file themselves to mail into a
   * void.
   */
  const { getFlVabAddress } = await import('../lib/flVabAddresses');
  const w = FILING_WINDOWS.FL;
  const at = (m, d) => new Date(Date.UTC(2026, m - 1, d));
  const pretty = (dt) => dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return {
    props: {
      windowOpenISO: at(w.openMonth, w.openDay).toISOString().slice(0, 10),
      windowCloseISO: at(w.closeMonth, w.closeDay).toISOString().slice(0, 10),
      trimOpen: pretty(at(w.openMonth, w.openDay)),
      trimDeadline: pretty(at(w.hardMonth, w.hardDay)),
      vab: getFlVabAddress('Hillsborough'),
    },
  };
}

export default function Tampa({ windowOpenISO, windowCloseISO, trimOpen, trimDeadline, vab }) {
const router = useRouter();
const [openFaq, setOpenFaq] = useState(null);
const go = () => router.push('/apply');

return (
<>
<Head>
<title>Tampa Property Tax Appeal Service | $139 All-In | TaxAppeal USA</title>
<meta name="description" content="Appeal your Tampa property taxes for $139 all-in ($89 service + $50 Hillsborough County VAB fee). We check whether a protest can actually lower your bill before you pay. We file your VAB petition and pay the county fee. No percentage cuts." />
<link rel="canonical" href="https://www.taxappealusa.com/tampa" />
<meta property="og:title" content="Tampa Property Tax Appeal — $139 All-In | TaxAppeal USA" />
<meta property="og:description" content="Appeal your Tampa property taxes for $139 all-in. We check whether a protest can actually lower your bill before you pay. We file your VAB petition and pay the mandatory county fee on your behalf." />
<meta property="og:url" content="https://www.taxappealusa.com/tampa" />
<meta property="og:type" content="website" />
<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(breadcrumbSchema([{name:'Home',href:'/'},{name:'Florida',href:'/florida'},{name:'Hillsborough County',href:'/counties/hillsborough-county-fl'},{name:'Tampa'}],'https://www.taxappealusa.com/tampa'))}} />
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
"@context":"https://schema.org","@type":"Service",
"name":"Tampa Property Tax Appeal Filing",
"provider":{"@type":"Organization","name":"TaxAppeal USA"},
"areaServed":{"@type":"City","name":"Tampa"},
"description":"Property tax VAB petition preparation, county filing fee payment, and tracked mail filing for Tampa homeowners.",
"offers":{"@type":"Offer","price":"139.00","priceCurrency":"USD"}
})}} />
</Head>
<style>{`
${FONT}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}
.btn-primary{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:16px 36px;font-size:16px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:background 0.2s;}
.btn-primary:hover{background:${C.gold};color:${C.darkNavy};}
@media(max-width:768px){.hero-stats{grid-template-columns:1fr 1fr !important;}.compare-grid{grid-template-columns:1fr !important;}.hero-title{font-size:28px !important;}.district-grid{grid-template-columns:1fr !important;}}
`}</style>

{(() => {
  const preOrderOpen = new Date('2026-06-12');
  const windowOpen = new Date(windowOpenISO);
  const windowClose = new Date(windowCloseISO);
  const today = new Date();
  const barStyle = { background: C.gold, color: C.darkNavy, textAlign: 'center', padding: '10px 16px', fontSize: 14, fontWeight: 600 };
  if (today >= preOrderOpen && today < windowOpen) {
    const days = Math.ceil((windowOpen - today) / (1000*60*60*24));
    return (
      <div style={barStyle}>
        🔒 Reserve your Hillsborough County spot now — TRIM notices start arriving in {days} days. Lock in the $89 rate today; we file the moment your county's window opens. <a href="/apply" style={{ color: C.darkNavy, textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
      </div>
    );
  }
  if (today >= windowOpen && today <= windowClose) {
    return (
      <div style={barStyle}>
        🚨 Florida's filing window is open — file before your county's 25-day deadline. <a href="/apply" style={{ color: C.darkNavy, textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
      </div>
    );
  }
  return null;
})()}


<div style={{background:C.white,borderBottom:`1.5px solid ${C.border}`,padding:"16px 40px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<a href="/" style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none"}}>
<div style={{width:34,height:34,background:C.navy,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🏠</div>
<div>
<div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:C.darkNavy}}>TaxAppeal USA</div>
<div style={{fontSize:9,textTransform:"uppercase",letterSpacing:"1.5px",color:C.mutedGray}}>Property Tax Dispute</div>
</div>
</a>
<button className="btn-primary" style={{padding:"10px 22px",fontSize:14}} onClick={go}>Start my appeal →</button>
</div>

<section style={{background:C.navy,padding:"64px 40px",color:C.white}}>
<div style={{maxWidth:900,margin:"0 auto"}}>
<div style={{fontSize:12,color:C.gold,textTransform:"uppercase",letterSpacing:"2px",marginBottom:16}}>Tampa, Florida — Property Tax Appeal Service</div>
<h1 className="hero-title" style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,marginBottom:16}}>Tampa Property Tax Appeal — $139 All-In</h1>
<p style={{fontSize:18,color:"#8596AF",lineHeight:1.6,maxWidth:640,marginBottom:16}}>Tampa home values have risen dramatically and Hillsborough County assessments frequently exceed actual market value. TaxAppeal files your formal VAB petition and pays the mandatory county fee — all for $139 total.</p>
{/* Pricing breakdown */}
<div style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"12px 16px",marginBottom:20,display:"inline-flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
<span style={{fontSize:13,color:"#8596AF"}}><span style={{color:C.gold,fontWeight:700}}>$89</span> service fee</span>
<span style={{color:"#5A7A9F"}}>+</span>
<span style={{fontSize:13,color:"#8596AF"}}><span style={{color:C.gold,fontWeight:700}}>$50</span> Hillsborough County VAB fee <span style={{fontSize:11,color:"#5A7A9F"}}>(required by FL law)</span></span>
<span style={{color:"#5A7A9F"}}>=</span>
<span style={{fontSize:14,color:C.white,fontWeight:700}}>$139 total — you sign it, we file and pay the county fee</span>
</div>
<div style={{background:"#C0392B",display:"block",borderRadius:6,padding:"8px 14px",fontSize:13,color:C.white,fontWeight:500,marginBottom:24,width:"fit-content"}}>
⚠️ Florida requires RECEIPT by deadline — not just postmark. We file 7+ days early.
</div>
<div className="hero-stats" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:32}}>
{[["$89","Service fee"],["$139","All-in total"],["0%","Of your savings taken"],["Hillsborough","Service area"]].map(([n,l]) => (
<div key={l} style={{background:"#0F1F3D",borderRadius:10,padding:"16px",textAlign:"center"}}>
<div style={{fontFamily:"'DM Serif Display',serif",fontSize:n.length>8?14:28,color:C.gold}}>{n}</div>
<div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div>
</div>
))}
</div>
<button className="btn-primary" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>File My Tampa Appeal — $139 All-In →</button>
<div style={{fontSize:13,color:"#5A7A9F",marginTop:12}}>Takes about 4 minutes. $89 service + $50 Hillsborough County VAB fee. We pay the county on your behalf.</div>
</div>
</section>

<section style={{padding:"56px 40px",background:C.white}}>
<div style={{maxWidth:800,margin:"0 auto"}}>
<h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Why Tampa Homeowners Should File</h2>
<p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>Every Florida county publishes its own VAB results, and outcomes differ sharply between them. Here's why Tampa homeowners have especially strong grounds.</p>
<div style={{display:"grid",gap:24}}>
{[
["📊","Hillsborough County Uses Mass Appraisal — Your Home May Be Over-Valued","Florida's TRIM notice arrives every August. Tampa homeowners have only 25 days to file a VAB petition — and Florida requires RECEIPT by the deadline, not just postmark. TaxAppeal files 7+ days early."],
["📈","Market Conditions Support Your Case","Tampa's explosive growth in neighborhoods like South Tampa, Hyde Park, Seminole Heights, and New Tampa has led to assessed values that often outpace actual market conditions."],
["💳","We Handle the County Fee For You","Hillsborough charges the $50 VAB filing fee (HB 7031's state maximum). We pay it on your behalf with your petition — you don't need to make a separate trip to the county or write a separate check."],
].map(([icon,title,desc]) => (
<div key={title} style={{display:"flex",gap:16}}>
<div style={{width:44,height:44,background:C.lightBlue,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
<div>
<h3 style={{fontSize:17,fontWeight:500,marginBottom:6}}>{title}</h3>
<p style={{fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{desc}</p>
</div>
</div>
))}
</div>
</div>
</section>

<section style={{padding:"56px 40px",background:C.lightBlue}}>
<div style={{maxWidth:800,margin:"0 auto"}}>
<h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Where Your Hillsborough Petition Goes</h2>
<p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36}}>TaxAppeal prepares your VAB petition, you sign it, and we mail it with the county filing fee paid to the Hillsborough County Value Adjustment Board, mailed 7+ days before your deadline to ensure timely receipt.</p>
<div className="district-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
<div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,padding:24}}>
<div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"1px",color:C.mutedGray,marginBottom:12}}>Appraisal Authority</div>
<div style={{fontSize:16,fontWeight:600,color:C.darkNavy,marginBottom:16}}>Hillsborough County VAB</div>
{[["📍",`${vab.vabName}`],["✉️",`${vab.attn}`],["🏛️",`${vab.street}, ${vab.city}, ${vab.state} ${vab.zip}`],["📅",`Deadline: ${trimDeadline} — by physical receipt, not postmark`],["💵","County VAB fee: $50 (we pay it with your petition — $139 all-in)"],["⚖️","Florida Statute §194.011"]].map(([icon,text]) => (
<div key={text} style={{display:"flex",gap:10,marginBottom:10,fontSize:13,color:C.bodyGray}}>
<span style={{flexShrink:0}}>{icon}</span><span>{text}</span>
</div>
))}
</div>
<div style={{background:C.navy,borderRadius:12,padding:24,color:C.white}}>
<div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"1px",color:C.gold,marginBottom:12}}>What TaxAppeal Does</div>
<div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:C.gold,marginBottom:16}}>What We Do For You</div>
{["Analyze comparable sales in Tampa","Draft formal VAB petition citing Florida Statute §194.011","Pay the $50 county filing fee on your behalf","File via mail 7+ days early","You receive copy and tracking number","Keep 100% of your savings"].map(item => (
<div key={item} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:10,fontSize:13}}>
<span style={{flexShrink:0,marginTop:1,color:C.gold}}>✓</span><span style={{color:"#cbd5e1"}}>{item}</span>
</div>
))}
</div>
</div>
</div>
</section>

<section style={{padding:"56px 40px",background:C.white}}>
<div style={{maxWidth:800,margin:"0 auto"}}>
<h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>TaxAppeal vs. Other Tampa Tax Appeal Companies</h2>
<p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36}}>Most Tampa property tax firms charge 25–40% of your savings every year. Here's how TaxAppeal's $139 all-in compares.</p>
<div className="compare-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
<div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,padding:24}}>
<div style={{fontSize:12,textTransform:"uppercase",letterSpacing:"1px",color:C.mutedGray,marginBottom:12}}>Typical Tampa Firm</div>
<div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:"#C0392B",marginBottom:8}}>25–40% of savings</div>
<p style={{fontSize:14,color:C.bodyGray,lineHeight:1.7,marginBottom:16}}>On a $2,200 reduction, that's $550–$880 in fees — every single year.</p>
{["Contingency fee every year","May cherry-pick easy cases","You lose a large portion of savings"].map(item => (
<div key={item} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:13,color:"#C0392B"}}>✗ {item}</div>
))}
</div>
<div style={{background:C.navy,borderRadius:12,padding:24}}>
<div style={{fontSize:12,textTransform:"uppercase",letterSpacing:"1px",color:C.gold,marginBottom:12}}>TaxAppeal USA</div>
<div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:C.gold,marginBottom:8}}>$139 all-in. Period.</div>
<p style={{fontSize:14,color:"#8596AF",lineHeight:1.7,marginBottom:16}}>Same $2,200 reduction. Pay $139 once (including county fee) and keep $2,061. Every year after is 100% yours.</p>
{["$89 service + $50 county fee, total","County VAB fee paid on your behalf","Keep 100% of your savings","Mailed 7+ days early"].map(item => (
<div key={item} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:13,color:C.gold}}>✓ {item}</div>
))}
</div>
</div>
</div>
</section>

<section style={{padding:"56px 40px",background:C.bg}}>
<div style={{maxWidth:800,margin:"0 auto"}}>
<h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>Tampa Property Tax Appeal FAQ</h2>
{faqs.map(([q,a],i) => (
<div key={i} style={{background:C.white,border:`1.5px solid ${openFaq===i?C.navy:C.border}`,borderRadius:10,marginBottom:10,overflow:"hidden"}}>
<div onClick={() => setOpenFaq(openFaq===i?null:i)} style={{padding:"16px 20px",fontSize:15,fontWeight:500,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
{q}<span style={{color:C.mutedGray,transform:openFaq===i?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
</div>
{openFaq===i && <div style={{padding:"0 20px 16px",fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{a}</div>}
</div>
))}
</div>
</section>

<section style={{background:C.navy,padding:"64px 40px",textAlign:"center"}}>
<h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>Ready to appeal your Tampa property taxes?</h2>
<p style={{fontSize:16,color:"#8596AF",marginBottom:8}}>Join Tampa homeowners saving money every year.</p>
<p style={{fontSize:14,color:"#5A7A9F",marginBottom:28}}>$89 service fee + $50 Hillsborough County VAB fee = $139 all-in. We handle the county payment for you.</p>
<button className="btn-primary" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>Start My Tampa Appeal — $139 All-In →</button>
</section>

<footer style={{background:C.darkNavy,padding:"24px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
<p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
<div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
{[["Texas","/texas"],["Georgia","/georgia"],["Florida","/florida"],["Houston","/houston"],["Dallas","/dallas"],["Fort Worth","/fort-worth"],["Austin","/austin"],["Atlanta","/atlanta"],["Miami","/miami"],["Tampa","/tampa"],["Terms","/terms"],["Privacy","/privacy"]].map(([label,href]) => (
<a key={href} href={href} style={{color:C.mutedGray,fontSize:12,textDecoration:"none"}}>{label}</a>
))}
</div>
</footer>
</>
);
}
