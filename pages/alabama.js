import Head from 'next/head';
import { useState } from 'react';
import SeasonNotice, { SeasonNavCta } from '../components/SeasonNotice';
import { stateSaleStatus } from '../lib/stateService';

/**
 * ALABAMA IS NOT ON SALE, AND THIS PAGE USED TO SAY IT WAS.
 *
 * Until 25 Aug 2026 this file carried a green badge reading "✅ Now Serving All 67
 * Alabama Counties", a FAQ answer reading "Yes. TaxAppeal USA files appeals in all
 * 67 Alabama counties", six "$89" buy buttons, sixty-seven county tiles that were
 * each an onClick={go} buy button, and a schema.org Offer at price 89.00 that
 * Google reads as a live commercial offer — while pages/apply.js refused every
 * Alabama order on sight, because we cannot yet vouch for the envelope in any
 * non-Florida state (see the note above SUPPORTED_STATES there).
 *
 * Everything on this page that a homeowner could click led to a state selector
 * that rejected them — but only AFTER they had created an account and typed their
 * full property address. Two forms, then the truth.
 *
 * The tax content below is accurate and worth keeping; only the commercial promise
 * was false. So the facts stay and the price comes off, and both the badge and the
 * CTA are now DERIVED from lib/stateService.js rather than typed here. Delete
 * Alabama's line from SERVING_FROM and this page sells again with no edit.
 */
const C={navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",lightBlue:"#EEF3FB",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF",green:"#2E7D52"};
const FONT="@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');";

// Module scope on purpose: stateSaleStatus is pure and clock-independent, so the
// same value is available to the FAQ answers (which are ALSO emitted as
// schema.org FAQPage markup and so have to be true), to the Head block, and to
// the body. One read, no chance of the markup and the page disagreeing.
const SVC=stateSaleStatus('AL');

const faqs=[["What is the Alabama property tax appeal deadline?","You have 30 days from the date on your Notice of Valuation to file with your county Board of Equalization. Notices arrive April–August. Missing this deadline means waiting until next year."],["Does Alabama have a two-way review risk?","Yes. The Alabama BOE can increase, decrease, or maintain your assessed value. TaxAppeal only files when comparable evidence clearly supports a lower value."],["How does Alabama assess property value?","Alabama assesses Class III residential property at 10% of fair market value. If the county overestimates your property's fair market value, your assessed value and tax bill are both inflated."],["What is Alabama's HB73 assessment cap?","Act 2024-344 limits annual increases to 7%/year for owner-occupied Class III homes, effective October 2024. Resets on ownership change — making appeals most valuable for recent buyers."],["Do I need to sign anything?","Yes — you review and electronically sign your appeal before it's mailed, recorded with your name and timestamp. TaxAppeal prepares and files the appeal, but it's filed in your name; we are not your agent or representative before the Board of Equalization."],["Does TaxAppeal serve all Alabama counties?",SVC.selling?"Yes. TaxAppeal USA files appeals in all 67 Alabama counties.":`Not yet. We are not filing Alabama appeals this season — we will be filing for the ${SVC.servingFrom} season, in all 67 counties. Before we file in a state we confirm the exact office every appeal must reach; we have done that work for Florida and are doing it for Alabama now. Leave your email on this page and we will tell you the day it opens.`],["Can I appeal Alabama property taxes every year?","Yes. The 30-day window opens annually when your Notice of Valuation arrives."],["What happens after the BOE decision?","If unsatisfied, you may appeal to Circuit Court — but must pay taxes by December 31 or post bond. TaxAppeal's service covers BOE level only."],["What evidence does TaxAppeal use?","Comparable sales, property record errors, and condition documentation. Every letter cites Code of Alabama §40-3-20."],["Is there a filing fee?",SVC.selling?"No. Alabama BOE appeals are free. TaxAppeal's $89 covers the full service.":`No — Alabama BOE appeals are free to file. When we open for the ${SVC.servingFrom} season our own fee will be a flat $89, with no percentage of your savings. Nothing is being sold on this page today.`]];
const counties=["Autauga","Baldwin","Barbour","Bibb","Blount","Bullock","Butler","Calhoun","Chambers","Cherokee","Chilton","Choctaw","Clarke","Clay","Cleburne","Coffee","Colbert","Conecuh","Coosa","Covington","Crenshaw","Cullman","Dale","Dallas","DeKalb","Elmore","Escambia","Etowah","Fayette","Franklin","Geneva","Greene","Hale","Henry","Houston","Jackson","Jefferson","Lamar","Lauderdale","Lawrence","Lee","Limestone","Lowndes","Macon","Madison","Marengo","Marion","Marshall","Mobile","Monroe","Montgomery","Morgan","Perry","Pickens","Pike","Randolph","Russell","St. Clair","Shelby","Sumter","Talladega","Tallapoosa","Tuscaloosa","Walker","Washington","Wilcox","Winston"].map(n=>n+" County");
export default function Alabama(){
  const [openFaq,setOpenFaq]=useState(null);
  return(<>
    <Head>
      <title>{SVC.selling?"Alabama Property Tax Appeal | $89 Flat Fee | TaxAppeal USA":`Alabama Property Tax Appeal | Opening for the ${SVC.servingFrom} season | TaxAppeal USA`}</title>
      <meta name="description" content={SVC.selling?"Appeal your Alabama property taxes for $89 flat. We prepare your appeal and file it via USPS certified mail with your county Board of Equalization. All 67 Alabama counties.":`How Alabama property tax appeals work: the 30-day Notice of Valuation deadline, the 10% Class III ratio, the HB73 cap and the Board of Equalization. TaxAppeal USA is not filing Alabama appeals this season — we open for the ${SVC.servingFrom} season and will email you the day it does.`} />
      <link rel="canonical" href="https://www.taxappealusa.com/alabama" key="canonical" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":faqs.map(([q,a])=>({"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}}))})}} />
      {/* THE Offer IS GATED, AND THAT IS THE POINT OF THIS WHOLE CHANGE.
          A schema.org Offer at price 89.00 is not decoration — Google reads it as a
          live commercial offer and can surface it as a price in results. Emitting it
          for a state pages/apply.js refuses on sight advertised something that could
          not be bought. While we are not selling, the page describes the service and
          says when it opens, and claims no price. */}
      {SVC.selling
        ? <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"Service","name":"Alabama Property Tax Appeal Filing","provider":{"@type":"Organization","name":"TaxAppeal USA"},"areaServed":{"@type":"State","name":"Alabama"},"description":"Property tax BOE appeal letter preparation and USPS certified mail filing. All 67 Alabama counties.","offers":{"@type":"Offer","price":"89.00","priceCurrency":"USD"}})}} />
        : <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"Service","name":"Alabama Property Tax Appeal Filing","provider":{"@type":"Organization","name":"TaxAppeal USA"},"areaServed":{"@type":"State","name":"Alabama"},"description":`Property tax BOE appeal letter preparation and USPS certified mail filing, all 67 Alabama counties. Not currently accepting Alabama orders; opening for the ${SVC.servingFrom} filing season.`})}} />}
    </Head>
    <style>{`${FONT} *{box-sizing:border-box;margin:0;padding:0;} body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};} .btn-p{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:14px 32px;font-size:15px;font-weight:500;cursor:pointer;transition:background 0.2s;} .btn-p:hover{background:${C.gold};color:${C.darkNavy};} @media(max-width:768px){.g4,.g2{grid-template-columns:1fr 1fr!important;}.g3{grid-template-columns:1fr!important;}.ht{font-size:28px!important;}}`}</style>
    <div style={{background:C.white,borderBottom:`1.5px solid ${C.border}`,padding:"16px 40px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <a href="/" style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none"}}><div style={{width:34,height:34,background:C.navy,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🏠</div><div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:C.darkNavy}}>TaxAppeal</div><div style={{fontSize:10,color:C.mutedGray,letterSpacing:"0.5px"}}>PROPERTY TAX DISPUTE</div></div></a>
      <SeasonNavCta stateCode="AL" />
    </div>
    <div style={{background:C.darkNavy,padding:"64px 40px 56px",textAlign:"center"}}>
      <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(255,201,64,0.15)",border:"1px solid rgba(255,201,64,0.3)",borderRadius:20,padding:"6px 16px",fontSize:12,color:C.gold,marginBottom:20,fontWeight:500}}>{SVC.selling?"✅ Now Serving All 67 Alabama Counties":`📬 Opening for the ${SVC.servingFrom} filing season — all 67 counties`}</div>
      <h1 className="ht" style={{fontFamily:"'DM Serif Display',serif",fontSize:46,color:C.white,marginBottom:16,lineHeight:1.15}}>{SVC.selling?<>Alabama Property Tax Appeal<br /><span style={{color:C.gold}}>$89 Flat. You Sign, We File.</span></>:<>Alabama Property Tax Appeals<br /><span style={{color:C.gold}}>How they work, and when we open</span></>}</h1>
      <p style={{fontSize:17,color:"#A0B4CC",maxWidth:620,margin:"0 auto 32px",lineHeight:1.6}}>{SVC.selling?"We draft your Board of Equalization appeal, you review and sign it electronically, and we file it via USPS certified mail — before your 30-day deadline.":`Alabama gives you 30 days from your Notice of Valuation to appeal to your county Board of Equalization. Everything below explains how that works and what it is worth. We are not filing Alabama appeals ourselves this season — we open for ${SVC.servingFrom}.`}</p>
      {SVC.selling
        ? <><button className="btn-p" style={{fontSize:18,padding:"18px 48px",marginBottom:12}}>Start My Alabama Appeal — $89 →</button>
          <div style={{fontSize:13,color:"#5A7A9F"}}>No contingency fees. You keep 100% of your savings.</div></>
        : <SeasonNotice stateCode="AL" variant="dark" />}
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,maxWidth:760,margin:"40px auto 0"}}>
        {[["67","Alabama counties"],["10%","Assessment ratio"],["30 days","Appeal window"],SVC.selling?["$89","All-inclusive fee"]:[String(SVC.servingFrom),"We open for filing"]].map(([n,l])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.06)",borderRadius:10,padding:"16px 12px",textAlign:"center"}}><div style={{fontFamily:"'DM Serif Display',serif",fontSize:24,color:C.gold}}>{n}</div><div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div></div>
        ))}
      </div>
    </div>
    <div style={{background:C.bg,padding:"56px 40px"}}>
      <div style={{maxWidth:840,margin:"0 auto"}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:32,color:C.darkNavy,marginBottom:8,textAlign:"center"}}>What Makes Alabama Different</h2>
        <p style={{textAlign:"center",color:C.bodyGray,fontSize:14,marginBottom:32}}>Key facts before you file.</p>
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          {[["You Sign Your Own Appeal","You review and electronically sign your appeal before it's mailed — recorded with your name and timestamp. It's filed in your name, not TaxAppeal's."],["Two-Way Review Risk","The Alabama BOE can raise your assessment during appeal. TaxAppeal only files when comparable evidence clearly supports a lower value, protecting you from upside risk."],["10% Assessment Ratio","Alabama assesses Class III residential property at 10% of fair market value. An over-estimated fair market value inflates everything above it."],["HB73 Cap (2024)","Act 2024-344 limits assessed value increases to 7%/year for owner-occupied homes — but resets on ownership change. Recent buyers face full market value with no cap."],["Postmark Deadline","Alabama uses a postmark deadline — mailing by the 30-day cutoff is sufficient. TaxAppeal files 7–10 days early via certified mail for documented proof."],["Circuit Court Escalation","If unsatisfied with the BOE decision, you may appeal to Circuit Court — but must pay taxes by Dec 31 or post bond. TaxAppeal covers BOE level only."]].map(([title,desc])=>(
            <div key={title} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,padding:24}}><div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:C.darkNavy,marginBottom:8}}>{title}</div><p style={{fontSize:13,color:C.bodyGray,lineHeight:1.65}}>{desc}</p></div>
          ))}
        </div>
      </div>
    </div>
    <div style={{background:C.white,padding:"56px 40px"}}><div style={{maxWidth:840,margin:"0 auto"}}>
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:32,color:C.darkNavy,textAlign:"center",marginBottom:40}}>How It Works</h2>
      <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:24}}>
        {[["1","Enter your property","Tell us your Alabama address. We pull your county assessor data and comparable sales."],["2","Review & sign","Review your AI-generated appeal letter citing Code of Alabama §40-3-20, then sign it electronically — it's your appeal, filed in your name."],["3","We file certified mail","Your signed appeal is mailed to your county BOE via USPS certified mail with tracking."]].map(([num,title,desc])=>(
          <div key={num} style={{background:C.bg,borderRadius:12,padding:24}}><div style={{width:36,height:36,background:C.navy,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontFamily:"'DM Serif Display',serif",fontSize:18,marginBottom:12}}>{num}</div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:C.darkNavy,marginBottom:8}}>{title}</div><p style={{fontSize:13,color:C.bodyGray,lineHeight:1.6}}>{desc}</p></div>
        ))}
      </div>
    </div></div>
    <div style={{background:C.bg,padding:"56px 40px"}}><div style={{maxWidth:900,margin:"0 auto"}}>
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:C.darkNavy,textAlign:"center",marginBottom:8}}>All 67 Alabama Counties</h2>
      <p style={{textAlign:"center",color:C.bodyGray,fontSize:14,marginBottom:32}}>{SVC.selling?"TaxAppeal files appeals in every Alabama county.":`Every Alabama county has its own Board of Equalization. When we open for ${SVC.servingFrom} we will file in all of them.`}</p>
      {/* These sixty-seven tiles were each an onClick={go} buy button. Not a
          county page, not a link — a click target that sent the homeowner into a
          funnel that would refuse Alabama. While we are not selling they are
          what they look like: a list. */}
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {counties.map(c=><div key={c} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.bodyGray}}>{c}</div>)}
      </div>
    </div></div>
    <div style={{background:C.white,padding:"56px 40px"}}><div style={{maxWidth:700,margin:"0 auto",textAlign:"center"}}>
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:32,color:C.darkNavy,marginBottom:8}}>{SVC.selling?"Everything for $89 Flat":`What $89 will cover in ${SVC.servingFrom}`}</h2>
      <p style={{color:C.bodyGray,fontSize:15,marginBottom:32}}>{SVC.selling?"No percentage of savings. No contingency. You keep 100%.":"No percentage of savings. No contingency. You keep 100%. Nothing is being sold on this page today."}</p>
      <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,textAlign:"left",background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:16,padding:32,marginBottom:32}}>
        {["AI-generated appeal letter citing Code of Alabama §40-3-20","Electronic signature review before filing","USPS certified mail filing to your county BOE","Tracking number emailed to you",SVC.selling?"All 67 Alabama counties covered":`All 67 Alabama counties, from the ${SVC.servingFrom} season`,"No additional county filing fees"].map(item=><div key={item} style={{fontSize:14,color:C.bodyGray,display:"flex",gap:8}}><span style={{color:C.green,fontWeight:700,flexShrink:0}}>✓</span>{item}</div>)}
      </div>
      {SVC.selling?<button className="btn-p" style={{fontSize:18,padding:"18px 48px"}}>Start My Alabama Appeal — $89 →</button>:<SeasonNotice stateCode="AL" id="notify-mid" />}
      <div style={{marginTop:12,fontSize:12,color:C.mutedGray}}>⚠️ TaxAppeal files at the BOE level only. Circuit Court appeals require separate legal representation.</div>
    </div></div>
    <div style={{background:C.bg,padding:"56px 40px"}}><div style={{maxWidth:720,margin:"0 auto"}}>
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:32,color:C.darkNavy,textAlign:"center",marginBottom:32}}>Alabama Property Tax Appeal FAQ</h2>
      {faqs.map(([q,a],i)=>(
        <div key={i} style={{background:C.white,border:`1.5px solid ${openFaq===i?C.navy:C.border}`,borderRadius:10,marginBottom:10,overflow:"hidden"}}>
          <div onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{padding:"18px 20px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <span style={{fontSize:14,fontWeight:500,color:C.darkNavy}}>{q}</span>
            <span style={{color:C.navy,fontSize:18,flexShrink:0}}>{openFaq===i?"−":"+"}</span>
          </div>
          {openFaq===i&&<div style={{padding:"0 20px 18px",fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{a}</div>}
        </div>
      ))}
    </div></div>
    <div style={{background:C.darkNavy,padding:"56px 40px",textAlign:"center"}}>
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>{SVC.selling?"Ready to Appeal Your Alabama Property Taxes?":`We open for Alabama in ${SVC.servingFrom}`}</h2>
      <p style={{color:"#A0B4CC",fontSize:16,marginBottom:32}}>{SVC.selling?"$89 flat. USPS certified mail. All 67 counties.":"Leave your email and we will tell you the day filing opens — with time to spare before your deadline."}</p>
      {SVC.selling?<button className="btn-p" style={{fontSize:18,padding:"18px 48px"}}>Start My Appeal — $89 →</button>:<SeasonNotice stateCode="AL" id="notify-foot" variant="dark" compact />}
    </div>
    <footer style={{background:"#070F1E",padding:"24px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
      <p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
      <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
        {[["Texas","/texas"],["Georgia","/georgia"],["Florida","/florida"],["Arkansas","/arkansas"],["Alabama","/alabama"],["Blog","/blog"],["Terms","/terms"],["Privacy","/privacy"]].map(([l,h])=>(<a key={l} href={h} style={{color:l==="Blog"?C.gold:C.mutedGray,fontSize:12,textDecoration:"none"}}>{l}</a>))}
      </div>
    </footer>
  </>);
}
