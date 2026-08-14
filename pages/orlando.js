import Head from 'next/head';
import { breadcrumbSchema } from '../lib/breadcrumbs';
import { useState } from 'react';
import { useRouter } from 'next/router';
const C={navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF"};
const FONT="@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');";
/**
 * A FUNCTION, not a constant — because two of these answers state dates and one
 * states a fee, and at module scope they could not see the derived props. That is
 * exactly how "typically August 11, 2026" survived the correction to 24 Aug, and
 * how the fee answer and the fee card came to disagree with each other on the same
 * page.
 */
const buildFaqs=({trimOpen,trimDeadline,vabFee,allIn,payableTo})=>[["What is the Orlando property tax appeal deadline?",`Twenty-five days from the mailing date of your TRIM notice. Orange County TRIM notices are expected around ${trimOpen}, which puts the 2026 deadline at ${trimDeadline}. Florida requires physical receipt by the VAB — a postmark alone is not sufficient.`],["What is a TRIM notice?",`Your Truth in Millage (TRIM) notice is Orange County's annual statement of your proposed property assessment and estimated taxes, mailed around ${trimOpen}.`],["Is there a filing fee for Orlando property tax appeals?",`Yes. Orange County charges a $${vabFee} VAB petition fee, payable to ${payableTo}. We pay it on your behalf and it is added at checkout, so your total is $${allIn} — our $89 service fee plus the county's $${vabFee}.`],["Does Florida have two-way review risk?","No. Florida's VAB can only reduce or maintain your assessment — it cannot raise it."],["Does TaxAppeal serve Orlando and Orange County?","Yes. TaxAppeal serves all Orange County properties including Orlando, Winter Park, Kissimmee, and Lake Buena Vista."]];
/**
 * EVERY NUMBER AND DATE ON THIS PAGE IS DERIVED. Rewritten 11 Aug 2026.
 *
 * This page was hand-written and drifted from the tables that actually govern the
 * transaction, in both directions at once:
 *
 *   - A card headed "$50 County Fee Only" whose body read "Orange County's VAB
 *     petition fee is just $15." Checkout charges $50. The customer read $15 and
 *     was billed $139. This is the THIRD time this defect has shipped on this page
 *     (see the 30 Jul log, where fixing Jacksonville was described as "the /orlando
 *     defect repeating").
 *   - `windowOpen = new Date('2026-08-11')`, which from 11 Aug rendered
 *     "Florida's filing window is open — file before your county's deadline" and
 *     linked to /apply, while lib/filingWindows.js says 24 Aug and the funnel
 *     refuses anything but a pre-order until then. Thirteen days of a banner
 *     telling people to do something the checkout would not let them do.
 *
 * Both now come from getStaticProps: the fee from lib/flCountyFees.js — the same
 * table pages/api/send-letter.js writes the cheque from — and the dates from
 * FILING_WINDOWS.FL, the same table pages/apply.js gates on. A number that is
 * typed here can drift. One that is derived cannot, and scripts/verify-pages.mjs
 * now asserts both for this page.
 *
 * Imported inside getStaticProps, not at module scope: lib/flCountyFees.js is the
 * whole 67-county table and has no business in a client bundle to render one fee.
 */
export async function getStaticProps() {
  const { getFlVabFee } = await import('../lib/flCountyFees');
  const { FILING_WINDOWS } = await import('../lib/filingWindows');

  const COUNTY = 'Orange';
  const fee = getFlVabFee(COUNTY);
  const w = FILING_WINDOWS.FL;
  const at = (m, d) => new Date(Date.UTC(2026, m - 1, d));
  const pretty = (dt) => dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  return {
    props: {
      vabFee: fee.vabFee / 100,
      allIn: 89 + fee.vabFee / 100,
      payableTo: fee.payableTo,
      windowOpenISO: at(w.openMonth, w.openDay).toISOString().slice(0, 10),
      windowCloseISO: at(w.closeMonth, w.closeDay).toISOString().slice(0, 10),
      trimOpen: pretty(at(w.openMonth, w.openDay)),
      trimDeadline: pretty(at(w.hardMonth, w.hardDay)),
      // The receipt buffer the dispatch cron actually enforces. The page used to
      // promise "7-10 days early to ensure timely receipt" while lib/filingWindows.js
      // had already raised minDays to 12 BECAUSE a live Lob cheque reported its own
      // delivery range as 7-14 days — at 10 the last petition arrived four days late.
      minDays: w.minDays,
    },
  };
}

export default function Orlando({ vabFee, allIn, payableTo, windowOpenISO, windowCloseISO, trimOpen, trimDeadline, minDays }){const router=useRouter();const [openFaq,setOpenFaq]=useState(null);const go=()=>router.push('/apply');const faqs=buildFaqs({trimOpen,trimDeadline,vabFee,allIn,payableTo});return(<><Head><title>Orlando Florida Property Tax Appeal | $89 Flat | TaxAppeal USA</title><meta name="description" content="Appeal your Orlando Florida property taxes for $89 flat. Orange County: challenge your assessment before the 25-day TRIM deadline. No two-way review risk. TaxAppeal USA." /><link rel="canonical" href="https://www.taxappealusa.com/orlando" key="canonical" /><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(breadcrumbSchema([{name:'Home',href:'/'},{name:'Florida',href:'/florida'},{name:'Orange County',href:'/counties/orange-county-fl'},{name:'Orlando'}],'https://www.taxappealusa.com/orlando'))}} /><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"Service","name":"Orlando Property Tax Appeal Filing","provider":{"@type":"Organization","name":"TaxAppeal USA"},"areaServed":{"@type":"City","name":"Orlando"},"description":"Florida VAB petition preparation and tracked mail filing for Orlando homeowners.","offers":{"@type":"Offer","price":"139.00","priceCurrency":"USD"}})}} /></Head>
<style>{`${FONT} *{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}.btn-p{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:14px 32px;font-size:15px;font-weight:500;cursor:pointer;transition:background 0.2s;}.btn-p:hover{background:${C.gold};color:${C.darkNavy};}@media(max-width:768px){.hs{grid-template-columns:1fr 1fr!important;}.ht{font-size:28px!important;}.g2{grid-template-columns:1fr!important;}}`}</style>

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
        🔒 Reserve your Orange County spot now — TRIM notices start arriving in {days} days. Lock in the $89 rate today; we file the moment your county's window opens. <a href="/apply" style={{ color: '#0F1F3D', textDecoration: 'underline', marginLeft: 6, fontWeight: 700 }}>Get started →</a>
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
<section style={{background:C.navy,padding:"64px 40px",color:C.white}}><div style={{maxWidth:900,margin:"0 auto"}}><div style={{fontSize:12,color:C.gold,textTransform:"uppercase",letterSpacing:"2px",marginBottom:16}}>Orlando, Florida — Property Tax Appeal Service</div><h1 className="ht" style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,marginBottom:16}}>Orlando Property Tax Appeal — $89 Flat Fee</h1><p style={{fontSize:18,color:"#8596AF",lineHeight:1.6,maxWidth:640,marginBottom:32}}>Orlando homeowners: challenge your Orange County VAB assessment before the 25-day TRIM notice deadline. No two-way review risk. Our fee is $89 flat; with Orange County&rsquo;s ${vabFee} VAB petition fee, which we pay for you, your total is ${allIn}.</p><div className="hs" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:32}}>{[["25 days","From TRIM notice"],[`$${vabFee}`,"VAB petition fee"],["$89","TaxAppeal fee"],["Orange County","Service area"]].map(([n,l])=>(<div key={l} style={{background:"#0F1F3D",borderRadius:10,padding:"16px",textAlign:"center"}}><div style={{fontFamily:"'DM Serif Display',serif",fontSize:n.length>8?14:28,color:C.gold}}>{n}</div><div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div></div>))}</div><button className="btn-p" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>File My Orlando Appeal — $89 →</button><div style={{fontSize:13,color:"#5A7A9F",marginTop:12}}>Cited under Florida Statute §194.011. No two-way review risk.</div></div></section>
<section style={{padding:"56px 40px",background:C.white}}><div style={{maxWidth:800,margin:"0 auto"}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,textAlign:"center",marginBottom:32}}>Why Orlando Homeowners Should Appeal</h2><div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>{[["Receipt Deadline — Not Postmark",`Florida requires physical VAB receipt within 25 days of your TRIM notice — a postmark is not enough. We stop accepting new Orange County filings ${minDays} days before the deadline so yours has time to arrive, and we check the carrier's own delivery estimate against your deadline before it goes.`],["No Two-Way Risk","Florida's VAB cannot raise your assessment. The worst outcome is your value stays the same."],[`$${vabFee} County Fee — Paid For You`,`Orange County's VAB petition fee is $${vabFee}, payable to ${payableTo}. We pay it with your petition, so your total today is $${allIn}: our $89 service fee plus the county's $${vabFee}.`],["TRIM Window Is Short",`25 days passes quickly once TRIM notices go out. Your Orange County deadline is ${trimDeadline}.`]].map(([t,d])=>(<div key={t} style={{background:C.bg,borderRadius:12,padding:24}}><div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:C.darkNavy,marginBottom:8}}>{t}</div><p style={{fontSize:13,color:C.bodyGray,lineHeight:1.65}}>{d}</p></div>))}</div></div></section>
<section style={{padding:"56px 40px",background:C.bg}}><div style={{maxWidth:720,margin:"0 auto"}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,textAlign:"center",marginBottom:32}}>Orlando Property Tax FAQ</h2>{faqs.map(([q,a],i)=>(<div key={i} style={{background:C.white,border:`1.5px solid ${openFaq===i?C.navy:C.border}`,borderRadius:10,marginBottom:10,overflow:"hidden"}}><div onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{padding:"18px 20px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><span style={{fontSize:14,fontWeight:500,color:C.darkNavy}}>{q}</span><span style={{color:C.navy,fontSize:18,flexShrink:0}}>{openFaq===i?"−":"+"}</span></div>{openFaq===i&&<div style={{padding:"0 20px 18px",fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{a}</div>}</div>))}</div></section>
<div style={{background:C.darkNavy,padding:"56px 40px",textAlign:"center"}}><h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>File Before Your TRIM Deadline</h2><p style={{color:"#A0B4CC",fontSize:16,marginBottom:32}}>{`$${allIn} all-in — our $89 service fee plus Orange County's $${vabFee} VAB petition fee, which we pay with your petition. Deadline: ${trimDeadline}, by physical receipt.`}</p><button className="btn-p" style={{background:C.gold,color:C.darkNavy,fontSize:18,padding:"18px 48px"}} onClick={go}>Start My Orlando Appeal — $89 →</button></div>
<footer style={{background:"#070F1E",padding:"24px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}><p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p><div style={{display:"flex",gap:20,flexWrap:"wrap"}}>{[["Texas","/texas"],["Georgia","/georgia"],["Florida","/florida"],["Arkansas","/arkansas"],["Alabama","/alabama"],["Blog","/blog"],["Terms","/terms"],["Privacy","/privacy"]].map(([l,h])=>(<a key={l} href={h} style={{color:l==="Blog"?C.gold:C.mutedGray,fontSize:12,textDecoration:"none"}}>{l}</a>))}</div></footer></>);}
