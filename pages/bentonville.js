import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';

const C = { navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",lightBlue:"#EEF3FB",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF",green:"#2E7D52" };
const FONT = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap";

const faqs = [
  ["What is the deadline to appeal Bentonville property taxes?", "The Benton County Board of Equalization deadline is the third Monday in August — August 17, 2026. Your appeal letter must be postmarked by this date. TaxAppeal files via USPS certified mail to document your postmark."],
  ["How does Arkansas assess property taxes?", "Arkansas assesses residential property at 20% of fair market value. So if your home is worth $380,000, your assessed value is $76,000. When you appeal, you are arguing about the full market value — a 10% reduction in market value means 10% less in assessed value and a proportional reduction in your tax bill."],
  ["How much can Bentonville homeowners save?", "Your saving is the size of the reduction multiplied by your local tax rate, so it depends entirely on your own property — and where an assessment cap absorbs the reduction, it can be nothing at all. Our free check tells you which applies to you before you pay. TaxAppeal charges a flat $89 — you keep 100% of your savings."],
  ["What is the Benton County Board of Equalization?", "The Benton County Board of Equalization hears property tax appeals every August. It is made up of three members appointed by the county judge. You or your representative present evidence that your assessed value is too high, and the Board issues a decision."],
  ["Does postmark count in Arkansas?", "Yes. Arkansas requires your appeal to be postmarked by the third Monday in August — not physically received. TaxAppeal USA files via USPS certified mail, which provides a documented postmark date and delivery confirmation."],
  ["Can I appeal my Bentonville property taxes every year?", "Yes. Arkansas homeowners can file a new Board of Equalization appeal every August. Rising markets often create new over-assessments each cycle, so annual appeals are common and worthwhile."],
  ["Do I need to attend a hearing?", "You or your representative may attend. TaxAppeal files your written protest letter with supporting comparable sales evidence, which many counties accept without requiring a personal appearance. We handle the entire filing process for $89."],
];

export default function Bentonville() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState(null);
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>Bentonville Property Tax Appeal Service | File for $89 | TaxAppeal USA</title>
        <meta name="description" content="Appeal your Bentonville property taxes for $89 flat. We check whether a protest can actually lower your bill before you pay. We file with the Board of Equalization via certified mail before the August 17 deadline." />
        <link rel="canonical" href="https://www.taxappealusa.com/bentonville" key="canonical" />
        <meta property="og:title" content="Bentonville Property Tax Appeal — $89 Flat Fee | TaxAppeal USA" key="og:title" />
        <meta property="og:description" content="Appeal your Bentonville property taxes for $89 flat. Benton County Board of Equalization deadline: August 17, 2026." key="og:description" />
        <meta property="og:url" content="https://www.taxappealusa.com/bentonville" key="og:url" />
        <meta property="og:type" content="website" key="og:type" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":faqs.map(([q,a])=>( {"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}}))})}} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({"@context":"https://schema.org","@type":"Service","name":"Bentonville Property Tax Appeal Filing","provider":{"@type":"Organization","name":"TaxAppeal USA"},"areaServed":{"@type":"City","name":"Bentonville"},"offers":{"@type":"Offer","price":"89.00","priceCurrency":"USD"}})}} />
      </Head>
      <style>{`@import url('${FONT}');*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}.btn{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:16px 36px;font-size:16px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;}.btn:hover{background:${C.gold};color:${C.darkNavy};}@media(max-width:768px){.hs{grid-template-columns:1fr 1fr!important;}.ht{font-size:26px!important;}}`}</style>

      <div style={{background:C.white,borderBottom:"1.5px solid "+C.border,padding:"16px 40px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none"}}>
          <div style={{width:34,height:34,background:C.navy,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🏠</div>
          <div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:C.darkNavy}}>TaxAppeal USA</div><div style={{fontSize:9,textTransform:"uppercase",letterSpacing:"1.5px",color:C.mutedGray}}>Property Tax Dispute</div></div>
        </a>
        <button className="btn" style={{padding:"10px 22px",fontSize:14}} onClick={go}>Start my appeal</button>
      </div>

      <section style={{background:C.navy,padding:"64px 40px",color:C.white}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{fontSize:12,color:C.gold,textTransform:"uppercase",letterSpacing:"2px",marginBottom:16}}>Bentonville, Arkansas</div>
          <h1 className="ht" style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,marginBottom:16}}>Bentonville Property Tax Appeal — $89 Flat Fee</h1>
          <p style={{fontSize:18,color:"#8596AF",lineHeight:1.6,maxWidth:640,marginBottom:32}}>Northwest Arkansas is the fastest-growing real estate market in the state. Benton County assessments have surged with home values — creating strong grounds for Board of Equalization appeals. TaxAppeal files your certified protest letter for a flat $89.</p>
          <div className="hs" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:32}}>
            {[["Aug 17","2026 Deadline"],["0%","Of your savings taken"],["$89","Flat fee"],["Benton County","Service area"]].map(([n,l]) => (
              <div key={l} style={{background:"#0F1F3D",borderRadius:10,padding:16,textAlign:"center"}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:n.length>8?14:28,color:C.gold}}>{n}</div>
                <div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
          <button className="btn" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>File My Bentonville Appeal — $89</button>
          <div style={{fontSize:13,color:"#5A7A9F",marginTop:12}}>Takes about 4 minutes. You won't be charged until your letter is ready.</div>
        </div>
      </section>

      <section style={{padding:"24px 40px",background:"#FFF8E6",borderBottom:"1.5px solid #FFD97A"}}>
        <div style={{maxWidth:800,margin:"0 auto",display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:28}}>📅</div>
          <div>
            <div style={{fontWeight:700,fontSize:16,color:C.darkNavy}}>2026 Deadline: August 17 — Benton County Board of Equalization</div>
            <div style={{fontSize:14,color:C.bodyGray,marginTop:4}}>Per Arkansas Code §26-27-317, your appeal must be postmarked by the third Monday in August. TaxAppeal files via USPS certified mail. Orders close August 10 to ensure timely delivery.</div>
          </div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.white}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Why Bentonville Homeowners Should Appeal</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>Bentonville and the Rogers corridor have seen explosive growth driven by Walmart HQ, Walmart Global Tech, and the broader NW Arkansas tech boom. Rapid appreciation often means assessments overshoot market corrections — making appeals especially strong in Benton County.</p>
          <div style={{display:"grid",gap:24}}>
            {[["📊","Arkansas Assesses at 20% of Market Value","If your home's market value is overstated by Benton County, your assessed value (20% of market) is inflated by the same percentage — and so is your tax bill. A $30,000 market value reduction saves you real money every year."],["📅","The August 17 Deadline Is Firm","Arkansas has one fixed statewide deadline: the third Monday in August. Miss it and you must wait a full year. TaxAppeal files early via USPS certified mail to protect your postmark date."],["⚖️","No Percentage Fees — Ever","Most Arkansas property tax consultants charge 25-40% of your first-year savings. On a $1,000 reduction that's $250-400 gone before it reaches you. TaxAppeal charges $89 flat."]].map(([icon,title,desc]) => (
              <div key={title} style={{display:"flex",gap:16}}>
                <div style={{width:44,height:44,background:C.lightBlue,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
                <div><h3 style={{fontSize:17,fontWeight:500,marginBottom:6}}>{title}</h3><p style={{fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.lightBlue}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:10}}>How TaxAppeal Works in Bentonville</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36}}>Four minutes of your time. You sign it, we do the rest.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
            {[["1","Enter your address","We pull your Benton County property data — assessed value, square footage, year built, and comparable sales."],["2","We build your case","Our system generates a professional appeal letter citing Arkansas Code §26-27-317 and §26-26-1901 with comparable sales from your area."],["3","We file via certified mail","Your appeal is mailed to the Benton County Board of Equalization secretary via USPS certified mail before August 17."]].map(([n,t,d]) => (
              <div key={n} style={{background:C.white,borderRadius:12,padding:24,border:"1.5px solid "+C.border}}>
                <div style={{width:34,height:34,background:C.navy,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:500,color:C.white,marginBottom:14}}>{n}</div>
                <h3 style={{fontSize:15,fontWeight:500,marginBottom:8}}>{t}</h3>
                <p style={{fontSize:13,color:C.bodyGray,lineHeight:1.65}}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.white}}>
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,textAlign:"center",marginBottom:10}}>$89 Flat vs. Percentage-Based Firms</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:28}}>Most Bentonville property tax consultants charge 25-40% of savings. Here is what that costs you.</p>
          <div style={{border:"1.5px solid "+C.border,borderRadius:12,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead><tr style={{background:C.bg}}><th style={{padding:"12px 16px",textAlign:"left",fontWeight:600}}>Annual savings</th><th style={{padding:"12px 16px",textAlign:"center",fontWeight:600,color:C.navy}}>TaxAppeal ($89 flat)</th><th style={{padding:"12px 16px",textAlign:"center",fontWeight:600,color:"#888"}}>Contingency firm (33%)</th></tr></thead>
              <tbody>{[["$500","$89 fee — you keep $421","$165 fee — you keep $335"],["$1,000","$89 fee — you keep $921","$330 fee — you keep $670"],["$2,000","$89 fee — you keep $1,921","$660 fee — you keep $1,340"]].map(([s,o,t]) => (<tr key={s} style={{borderTop:"1px solid "+C.border}}><td style={{padding:"12px 16px",fontWeight:500}}>{s}/yr</td><td style={{padding:"12px 16px",textAlign:"center",color:C.green,fontWeight:600}}>{o}</td><td style={{padding:"12px 16px",textAlign:"center",color:C.bodyGray}}>{t}</td></tr>))}</tbody>
            </table>
          </div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.lightBlue}}>
        <div style={{maxWidth:720,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>Common Questions — Bentonville Property Tax Appeals</h2>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {faqs.map(([q,a],i) => (
              <div key={i} style={{background:C.white,border:"1.5px solid "+(openFaq===i?C.navy:C.border),borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"16px 20px",fontSize:15,fontWeight:500,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}} onClick={()=>setOpenFaq(openFaq===i?null:i)}>{q}<span style={{fontSize:16,color:C.mutedGray}}>▾</span></div>
                {openFaq===i && <div style={{padding:"0 20px 16px",fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{background:C.navy,padding:"64px 40px",textAlign:"center"}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>File Before August 17, 2026</h2>
        <p style={{fontSize:15,color:C.mutedGray,marginBottom:28}}>Don't miss the Benton County Board of Equalization deadline. You sign it, we file it — $89 flat.</p>
        <button style={{background:C.gold,color:C.darkNavy,border:"none",borderRadius:8,padding:"18px 44px",fontSize:17,fontWeight:500,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}} onClick={go}>Start My Bentonville Appeal — $89</button>
      </div>

      <footer style={{background:C.darkNavy,padding:"24px 40px",textAlign:"center"}}>
        <p style={{fontSize:13,color:C.mutedGray,lineHeight:1.8}}>© 2026 TaxAppeal USA · <a href="mailto:customerservice@taxappealusa.com" style={{color:C.mutedGray}}>customerservice@taxappealusa.com</a></p>
        <p style={{fontSize:13,color:C.mutedGray}}>Serving Benton County, Arkansas · Deadline: August 17, 2026 · Arkansas Code §26-27-317</p>
        <p style={{marginTop:8,fontSize:13}}><a href="/" style={{color:C.mutedGray,marginRight:16}}>Home</a><a href="/arkansas" style={{color:C.mutedGray,marginRight:16}}>Arkansas</a><a href="/terms" style={{color:C.mutedGray,marginRight:16}}>Terms</a><a href="/privacy" style={{color:C.mutedGray}}>Privacy</a></p>
      </footer>
    </>
  );
}
