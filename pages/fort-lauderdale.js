import Head from 'next/head';
import { breadcrumbSchema } from '../lib/breadcrumbs';
import { useState } from 'react';
import { useRouter } from 'next/router';
const C={navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF"};
const FONT="@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');";
const faqs=[["What is the Fort Lauderdale property tax appeal deadline?","25 days from the mailing date of your TRIM notice, twenty-five days after your TRIM notice is mailed. Florida requires physical receipt by the Broward County VAB \u2014 a postmark alone is not enough."],["Is there a filing fee for Fort Lauderdale property tax appeals?","Yes. Broward County VAB charges a $25 petition fee, added at checkout. TaxAppeal's $89 covers the full service."],["Does Florida have two-way review risk?","No. Florida's VAB can only reduce or maintain your assessment — it cannot raise it."],["Does TaxAppeal serve Fort Lauderdale and Broward County?","Yes. TaxAppeal serves all Broward County communities including Fort Lauderdale, Pompano Beach, Hollywood, Coral Springs, Pembroke Pines, Miramar, and Weston."],["How much can Broward County homeowners save?","A $50,000 value reduction saves approximately $1,000–1,200/year at Broward's effective rate."]];
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
  const w = FILING_WINDOWS.FL;
  const at = (m, d) => new Date(Date.UTC(2026, m - 1, d));
  const pretty = (dt) => dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return {
    props: {
      windowOpenISO: at(w.openMonth, w.openDay).toISOString().slice(0, 10),
      windowCloseISO: at(w.closeMonth, w.closeDay).toISOString().slice(0, 10),
      trimOpen: pretty(at(w.openMonth, w.openDay)),
      trimDeadline: pretty(at(w.hardMonth, w.hardDay)),
    },
  };
}

export default function FortLauderdale({ windowOpenISO, windowCloseISO, trimOpen, trimDeadline }){const router=useRouter();const [openFaq,setOpenFaq]=useState(null);const go=()=>router.push('/apply');return(<><Head><title>Fort Lauderdale Property Tax Appeal | $89 Flat | TaxAppeal USA</title><meta name="description" content="Appeal your Fort Lauderdale Florida property taxes for $89 flat. Broward County VAB: challenge your assessment before the 25-day TRIM deadline. No two-way review risk. TaxAppeal USA." /><link rel="canonical" href="https://www.taxappealusa.com/fort-lauderdale" key="canonical" /><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(breadcrumbSchema([{name:'Home',href:'/'},{name:'Florida',href:'/florida'},{name:'Broward County',href:'/counties/broward-county-fl'},{name:'Fort Lauderdale'}],'https://www.taxappealusa.com/fort-lauderdale'))}} /></Head>
{/* dangerouslySetInnerHTML, not a text child: React escapes ' & > in text and the client does not, so the two differ and hydration re-renders the whole root. See pages/apply.js. */}
<style dangerouslySetInnerHTML={{ __html: `${FONT} *{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}.btn-p{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:14px 32px;font-size:15px;font-weight:500;cursor:pointer;transition:background 0.2s;}.btn-p:hover{background:${C.gold};color:${C.darkNavy};}@media(max-width:768px){.hs{grid-template-columns:1fr 1fr!important;}.ht{font-size:28px!important;}.g2{grid-template-columns:1fr!important;}}` }} />

{(() => {
  const preOrderOpen = new Date('2026-06-12');
  const windowOpen = new Date(windowOpenISO);
  const windowClose = new Date(windowCloseISO);
  const today = new Date();
  const barStyle = { background: '#FFC940', color: '#0F1F3D', textAlign: 'center', padding: '10px 16px', fontSize: 14, fontWeight: 600 };
  if (today >= preOrderOpen && today < windowOpen) {
    const days = Math.ceil((windowOpen - today) / (1000*60*60*24));
    return (
      <div style={barStyle}>
        🔒 Reserve your Broward County spot now — TRIM notices start arriving in {days} days. Lock in the $89 rate today; we file the moment your county's window opens. <a href="/apply" style={{ color: '#0F1F3D', textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
      </div>
    );
  }
  if (today >= windowOpen && today <= windowClose) {
    return (
      <div style={barStyle}>
        🚨 Florida's filing window is open — file before your county's 25-day deadline. <a href="/apply" style={{ color: '#0F1F3D', textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
      </div>
    );
  }
  return null;
})()}

<div style={{background:C.white,borderBottom:`1.5px solid ${C.border}`,padding:"16px 40px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><a href="/" style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none"}}><div style={{width:34,height:34,background:C.navy,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🏠</div><div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:C.darkNavy}}>TaxAppeal USA</div><div style={{fontSize:9,textTransform:"uppercase",letterSpacing:"1.5px",color:C.mutedGray}}>Property Tax Dispute</div></div></a><button className="btn-p" style={{padding:"10px 22px",fontSize:14}} onClick={go}>Start my appeal →</button></div>
<section style={{background:C.navy,padding:"64px 40px",color:C.white}}><div style={{maxWidth:900,margin:"0 auto"}}><div style={{fontSize:12,color:C.gold,textTransform:"uppercase",letterSpacing:"2px",marginBottom:16}}>Fort Lauderdale, Florida — Property Tax Appeal Service</div><h1 className="ht" style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,marginBottom:16}}>Fort Lauderdale Property Tax Appeal — $89 Flat Fee</h1><p style={{fontSize:18,color:"#8596AF",lineHeight:1.6,maxWidth:640,marginBottom:32}}>Fort Lauderdale homeowners: challenge your Broward County VAB assessment before the 25-day TRIM notice deadline. No two-way review risk. TaxAppeal files for $89 flat.</p><div className="hs" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:32}}>{[["25 days","From TRIM notice"],["$25","VAB petition fee"],["$89","TaxAppeal fee"],["Broward Co.","Service area"]].map(([n,l])=>(<div key={l} style={{background:"#0F1F3D",borderRadius:10,padding:"16px",textAlign:"center"}}><div style={{fontFamily:"'DM Serif Display',serif",fontSize:n.length>8?14:28,color:C.gold}}>{n}</div><div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div></div>))}</div><button className="btn-p" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>File My Fort Lauderdale Appeal — $89 →</button><div style={{fontSize:13,color:"#5A7A9F",marginTop:12}}>Cited under Florida Statute §194.011. No two-way review risk.</div></div></section>
<section style={{padding:"56px 40px",background:C.white}}><div style={{maxWidth:800,margin:"0 auto"}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,textAlign:"center",marginBottom:32}}>Why Fort Lauderdale Homeowners Should Appeal</h2><div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>{[["Receipt Deadline — Not Postmark","Florida requires physical VAB receipt within 25 days of your TRIM notice. TaxAppeal mails your petition 7–10 days early to ensure timely receipt."],["No Two-Way Risk","Florida's VAB cannot raise your assessment. The worst outcome is your value stays the same."],["Waterfront Premium Distortion","Fort Lauderdale's boating community and waterfront properties create wide value variation that mass appraisal misses."],["$25 Broward Fee Only","Broward County's entire VAB petition fee is just $25. No percentage of savings taken."]].map(([t,d])=>(<div key={t} style={{background:C.bg,borderRadius:12,padding:24}}><div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:C.darkNavy,marginBottom:8}}>{t}</div><p style={{fontSize:13,color:C.bodyGray,lineHeight:1.65}}>{d}</p></div>))}</div></div></section>
<section style={{padding:"56px 40px",background:C.bg}}><div style={{maxWidth:720,margin:"0 auto"}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,textAlign:"center",marginBottom:32}}>Fort Lauderdale Property Tax FAQ</h2>{faqs.map(([q,a],i)=>(<div key={i} style={{background:C.white,border:`1.5px solid ${openFaq===i?C.navy:C.border}`,borderRadius:10,marginBottom:10,overflow:"hidden"}}><div onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{padding:"18px 20px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><span style={{fontSize:14,fontWeight:500,color:C.darkNavy}}>{q}</span><span style={{color:C.navy,fontSize:18,flexShrink:0}}>{openFaq===i?"−":"+"}</span></div>{openFaq===i&&<div style={{padding:"0 20px 18px",fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{a}</div>}</div>))}</div></section>
<div style={{background:C.darkNavy,padding:"56px 40px",textAlign:"center"}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>File Before Your TRIM Deadline</h2><p style={{color:"#A0B4CC",fontSize:16,marginBottom:32}}>$89 flat. 25-day receipt deadline from TRIM notice {`, deadline ${trimDeadline}.`} $114 all-in &mdash; our $89 service fee plus Broward County&rsquo;s $25 VAB petition fee, which we pay with your petition.</p><button className="btn-p" style={{background:C.gold,color:C.darkNavy,fontSize:18,padding:"18px 48px"}} onClick={go}>Start My Fort Lauderdale Appeal — $89 →</button></div>
<footer style={{background:"#070F1E",padding:"24px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}><p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p><div style={{display:"flex",gap:20,flexWrap:"wrap"}}>{[["Texas","/texas"],["Georgia","/georgia"],["Florida","/florida"],["Arkansas","/arkansas"],["Alabama","/alabama"],["Blog","/blog"],["Terms","/terms"],["Privacy","/privacy"]].map(([l,h])=>(<a key={l} href={h} style={{color:l==="Blog"?C.gold:C.mutedGray,fontSize:12,textDecoration:"none"}}>{l}</a>))}</div></footer></>);}
