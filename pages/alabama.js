import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
const C={navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",lightBlue:"#EEF3FB",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF",green:"#2E7D52"};
const FONT="@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');";
const faqs=[["What is the Alabama property tax appeal deadline?","You have 30 days from the date on your Notice of Valuation to file with your county Board of Equalization. Notices arrive April–August. Missing this deadline means waiting until next year."],["Does Alabama have a two-way review risk?","Yes. The Alabama BOE can increase, decrease, or maintain your assessed value. TaxAppeal only files when comparable evidence clearly supports a lower value."],["How does Alabama assess property value?","Alabama assesses Class III residential property at 10% of fair market value. If the county overestimates your property's fair market value, your assessed value and tax bill are both inflated."],["What is Alabama's HB73 assessment cap?","Act 2024-344 limits annual increases to 7%/year for owner-occupied Class III homes, effective October 2024. Resets on ownership change — making appeals most valuable for recent buyers."],["Does TaxAppeal handle the agent authorization requirement?","Yes. Alabama BOE requires signed agent authorization for third-party filers. TaxAppeal includes electronic authorization at checkout — recorded with your name and timestamp — filed as page 2 of your certified mail letter."],["Does TaxAppeal serve all Alabama counties?","Yes. TaxAppeal USA files appeals in all 67 Alabama counties."],["Can I appeal Alabama property taxes every year?","Yes. The 30-day window opens annually when your Notice of Valuation arrives."],["What happens after the BOE decision?","If unsatisfied, you may appeal to Circuit Court — but must pay taxes by December 31 or post bond. TaxAppeal's service covers BOE level only."],["What evidence does TaxAppeal use?","Comparable sales, property record errors, and condition documentation. Every letter cites Code of Alabama §40-3-20."],["Is there a filing fee?","No. Alabama BOE appeals are free. TaxAppeal's $89 covers the full service including agent authorization."]];
const counties=["Autauga","Baldwin","Barbour","Bibb","Blount","Bullock","Butler","Calhoun","Chambers","Cherokee","Chilton","Choctaw","Clarke","Clay","Cleburne","Coffee","Colbert","Conecuh","Coosa","Covington","Crenshaw","Cullman","Dale","Dallas","DeKalb","Elmore","Escambia","Etowah","Fayette","Franklin","Geneva","Greene","Hale","Henry","Houston","Jackson","Jefferson","Lamar","Lauderdale","Lawrence","Lee","Limestone","Lowndes","Macon","Madison","Marengo","Marion","Marshall","Mobile","Monroe","Montgomery","Morgan","Perry","Pickens","Pike","Randolph","Russell","St. Clair","Shelby","Sumter","Talladega","Tallapoosa","Tuscaloosa","Walker","Washington","Wilcox","Winston"].map(n=>n+" County");
export default function Alabama(){
  const router=useRouter();
  const [openFaq,setOpenFaq]=useState(null);
  const go=()=>router.push('/apply');
  return(<>
    <Head>
      <title>Alabama Property Tax Appeal | $89 Flat Fee | TaxAppeal USA</title>
      <meta name="description" content="Appeal your Alabama property taxes for $89 flat. Agent authorization included. We file with your county Board of Equalization via USPS certified mail. All 67 Alabama counties." />
      <link rel="canonical" href="https://www.taxappealusa.com/alabama" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":faqs.map(([q,a])=>({"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}}))})}} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"Service","name":"Alabama Property Tax Appeal Filing","provider":{"@type":"Organization","name":"TaxAppeal USA"},"areaServed":{"@type":"State","name":"Alabama"},"description":"Property tax BOE appeal letter, agent authorization, and certified mail filing. All 67 Alabama counties.","offers":{"@type":"Offer","price":"89.00","priceCurrency":"USD"}})}} />
    </Head>
    <style>{`${FONT} *{box-sizing:border-box;margin:0;padding:0;} body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};} .btn-p{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:14px 32px;font-size:15px;font-weight:500;cursor:pointer;transition:background 0.2s;} .btn-p:hover{background:${C.gold};color:${C.darkNavy};} @media(max-width:768px){.g4,.g2{grid-template-columns:1fr 1fr!important;}.g3{grid-template-columns:1fr!important;}.ht{font-size:28px!important;}}`}</style>
    <div style={{background:C.white,borderBottom:`1.5px solid ${C.border}`,padding:"16px 40px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <a href="/" style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none"}}><div style={{width:34,height:34,background:C.navy,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🏠</div><div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:C.darkNavy}}>TaxAppeal</div><div style={{fontSize:10,color:C.mutedGray,letterSpacing:"0.5px"}}>PROPERTY TAX DISPUTE</div></div></a>
      <button className="btn-p" onClick={go}>File My Appeal — $89</button>
    </div>
    <div style={{background:C.darkNavy,padding:"64px 40px 56px",textAlign:"center"}}>
      <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(255,201,64,0.15)",border:"1px solid rgba(255,201,64,0.3)",borderRadius:20,padding:"6px 16px",fontSize:12,color:C.gold,marginBottom:20,fontWeight:500}}>✅ Now Serving All 67 Alabama Counties</div>
      <h1 className="ht" style={{fontFamily:"'DM Serif Display',serif",fontSize:46,color:C.white,marginBottom:16,lineHeight:1.15}}>Alabama Property Tax Appeal<br /><span style={{color:C.gold}}>$89 Flat. Agent Authorization Included.</span></h1>
      <p style={{fontSize:17,color:"#A0B4CC",maxWidth:620,margin:"0 auto 32px",lineHeight:1.6}}>We draft your Board of Equalization appeal, handle the required agent authorization form, and file via USPS certified mail — before your 30-day deadline.</p>
      <button className="btn-p" style={{fontSize:18,padding:"18px 48px",marginBottom:12}} onClick={go}>Start My Alabama Appeal — $89 →</button>
      <div style={{fontSize:13,color:"#5A7A9F"}}>No contingency fees. You keep 100% of your savings.</div>
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,maxWidth:760,margin:"40px auto 0"}}>
        {[["67","Alabama counties"],["10%","Assessment ratio"],["30 days","Appeal window"],["$89","All-inclusive fee"]].map(([n,l])=>(
          <div key={l} style={{background:"rgba(255,255,255,0.06)",borderRadius:10,padding:"16px 12px",textAlign:"center"}}><div style={{fontFamily:"'DM Serif Display',serif",fontSize:24,color:C.gold}}>{n}</div><div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div></div>
        ))}
      </div>
    </div>
    <div style={{background:C.bg,padding:"56px 40px"}}>
      <div style={{maxWidth:840,margin:"0 auto"}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:32,color:C.darkNavy,marginBottom:8,textAlign:"center"}}>What Makes Alabama Different</h2>
        <p style={{textAlign:"center",color:C.bodyGray,fontSize:14,marginBottom:32}}>Key facts before you file.</p>
        <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          {[["Agent Authorization Required","Alabama BOE requires a signed agent authorization for third-party filers. TaxAppeal includes an electronic authorization at checkout — recorded with your name and timestamp — mailed as page 2 of your filing."],["Two-Way Review Risk","The Alabama BOE can raise your assessment during appeal. TaxAppeal only files when comparable evidence clearly supports a lower value, protecting you from upside risk."],["10% Assessment Ratio","Alabama assesses Class III residential property at 10% of fair market value. An over-estimated fair market value inflates everything above it."],["HB73 Cap (2024)","Act 2024-344 limits assessed value increases to 7%/year for owner-occupied homes — but resets on ownership change. Recent buyers face full market value with no cap."],["Postmark Deadline","Alabama uses a postmark deadline — mailing by the 30-day cutoff is sufficient. TaxAppeal files 7–10 days early via certified mail for documented proof."],["Circuit Court Escalation","If unsatisfied with the BOE decision, you may appeal to Circuit Court — but must pay taxes by Dec 31 or post bond. TaxAppeal covers BOE level only."]].map(([title,desc])=>(
            <div key={title} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,padding:24}}><div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:C.darkNavy,marginBottom:8}}>{title}</div><p style={{fontSize:13,color:C.bodyGray,lineHeight:1.65}}>{desc}</p></div>
          ))}
        </div>
      </div>
    </div>
    <div style={{background:C.white,padding:"56px 40px"}}><div style={{maxWidth:840,margin:"0 auto"}}>
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:32,color:C.darkNavy,textAlign:"center",marginBottom:40}}>How It Works</h2>
      <div className="g3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:24}}>
        {[["1","Enter your property","Tell us your Alabama address. We pull your county assessor data and comparable sales."],["2","Authorize & review","Electronically authorize TaxAppeal as your BOE filing agent. Review your AI-generated appeal letter citing Code of Alabama §40-3-20."],["3","We file certified mail","Your appeal plus agent authorization is mailed to your county BOE via USPS certified mail with tracking."]].map(([num,title,desc])=>(
          <div key={num} style={{background:C.bg,borderRadius:12,padding:24}}><div style={{width:36,height:36,background:C.navy,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:C.white,fontFamily:"'DM Serif Display',serif",fontSize:18,marginBottom:12}}>{num}</div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:C.darkNavy,marginBottom:8}}>{title}</div><p style={{fontSize:13,color:C.bodyGray,lineHeight:1.6}}>{desc}</p></div>
        ))}
      </div>
    </div></div>
    <div style={{background:C.bg,padding:"56px 40px"}}><div style={{maxWidth:900,margin:"0 auto"}}>
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:C.darkNavy,textAlign:"center",marginBottom:8}}>All 67 Alabama Counties</h2>
      <p style={{textAlign:"center",color:C.bodyGray,fontSize:14,marginBottom:32}}>TaxAppeal files appeals in every Alabama county.</p>
      <div className="g4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {counties.map(c=><div key={c} onClick={go} style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:12,color:C.bodyGray,cursor:"pointer"}}>{c}</div>)}
      </div>
    </div></div>
    <div style={{background:C.white,padding:"56px 40px"}}><div style={{maxWidth:700,margin:"0 auto",textAlign:"center"}}>
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:32,color:C.darkNavy,marginBottom:8}}>Everything for $89 Flat</h2>
      <p style={{color:C.bodyGray,fontSize:15,marginBottom:32}}>No percentage of savings. No contingency. You keep 100%.</p>
      <div className="g2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,textAlign:"left",background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:16,padding:32,marginBottom:32}}>
        {["AI-generated appeal letter citing Code of Alabama §40-3-20","Agent authorization form (required by Alabama BOE)","USPS certified mail filing to your county BOE","Tracking number emailed to you","All 67 Alabama counties covered","No additional county filing fees"].map(item=><div key={item} style={{fontSize:14,color:C.bodyGray,display:"flex",gap:8}}><span style={{color:C.green,fontWeight:700,flexShrink:0}}>✓</span>{item}</div>)}
      </div>
      <button className="btn-p" style={{fontSize:18,padding:"18px 48px"}} onClick={go}>Start My Alabama Appeal — $89 →</button>
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
      <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>Ready to Appeal Your Alabama Property Taxes?</h2>
      <p style={{color:"#A0B4CC",fontSize:16,marginBottom:32}}>$89 flat. Agent authorization included. USPS certified mail. All 67 counties.</p>
      <button className="btn-p" style={{fontSize:18,padding:"18px 48px"}} onClick={go}>Start My Appeal — $89 →</button>
    </div>
    <footer style={{background:"#070F1E",padding:"24px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
      <p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
      <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
        {[["Texas","/texas"],["Georgia","/georgia"],["Florida","/florida"],["Arkansas","/arkansas"],["Alabama","/alabama"],["Blog","/blog"],["Terms","/terms"],["Privacy","/privacy"]].map(([l,h])=>(<a key={l} href={h} style={{color:l==="Blog"?C.gold:C.mutedGray,fontSize:12,textDecoration:"none"}}>{l}</a>))}
      </div>
    </footer>
  </>);
}
