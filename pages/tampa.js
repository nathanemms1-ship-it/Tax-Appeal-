import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';

const C = { navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",lightBlue:"#EEF3FB",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF",green:"#2E7D52" };
const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;
const faqs = [["How do I appeal my Tampa property taxes?","File a VAB petition with the Hillsborough County Value Adjustment Board within 25 days of your TRIM notice. TaxAppeal files at least 7 days early via USPS certified mail to ensure receipt by Florida's strict deadline."],["What is the Hillsborough County Property Appraiser?","The Hillsborough County Property Appraiser determines assessed values for all properties in Hillsborough County including Tampa, Brandon, Plant City, and surrounding areas."],["How much can Tampa homeowners save?","Tampa homeowners save an average of $2,200 per year when they successfully appeal. TaxAppeal charges $79 flat — you keep 100% of your savings."],["What is the Tampa property tax appeal deadline?","25 days after your TRIM notice is mailed, typically mid-September. Florida requires RECEIPT by this date — not just postmark. TaxAppeal files 7+ days early to protect you."],["Does TaxAppeal serve all Hillsborough County cities?","Yes. We serve Tampa, Brandon, Plant City, Riverview, Valrico, Lithia, and every other city in Hillsborough County."]];

export default function Tampa() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState(null);
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>Tampa Property Tax Appeal Service | File for $79 | TaxAppeal USA</title>
        <meta name="description" content="Appeal your Tampa property taxes for $79 flat. Hillsborough County homeowners save an average of $2,200/year. We file your VAB petition via certified mail. No percentage cuts." />
        <link rel="canonical" href="https://www.taxappealusa.com/tampa" />
        <meta property="og:title" content="Tampa Property Tax Appeal — $79 Flat Fee | TaxAppeal USA" />
        <meta property="og:description" content="Appeal your Tampa property taxes for $79 flat. Hillsborough County homeowners save an average of $2,200/year. We file your VAB petition via certified mail. No percentage cuts." />
        <meta property="og:url" content="https://www.taxappealusa.com/tampa" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context":"https://schema.org","@type":"FAQPage",
          "mainEntity": faqs.map(([q,a]) => ({"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}}))
        })}} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context":"https://schema.org","@type":"Service",
          "name":"Tampa Property Tax Appeal Filing",
          "provider":{"@type":"Organization","name":"TaxAppeal USA"},
          "areaServed":{"@type":"City","name":"Tampa"},
          "description":"Property tax appeal letter preparation and USPS certified mail filing for Tampa homeowners.",
          "offers":{"@type":"Offer","price":"79.00","priceCurrency":"USD"}
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
          <h1 className="hero-title" style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,marginBottom:16}}>Tampa Property Tax Appeal — $79 Flat Fee</h1>
          <p style={{fontSize:18,color:"#8596AF",lineHeight:1.6,maxWidth:640,marginBottom:32}}>Tampa home values have risen dramatically and Hillsborough County assessments frequently exceed actual market value. TaxAppeal files your formal VAB petition for a flat $79 — no percentage cuts.</p>
          <div className="hero-stats" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:32}}>
            {[["82%","Approval rate"],["$2,200","Avg. savings"],["$79","Flat fee"],["Hillsborough County","Service area"]].map(([n,l]) => (
              <div key={l} style={{background:"#0F1F3D",borderRadius:10,padding:"16px",textAlign:"center"}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:n.length>8?14:28,color:C.gold}}>{n}</div>
                <div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>File My Tampa Appeal — $79 →</button>
          <div style={{fontSize:13,color:"#5A7A9F",marginTop:12}}>Takes about 4 minutes. You won't be charged until your letter is ready.</div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.white}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Why Tampa Homeowners Should File</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>82% of Florida property tax protests result in a reduction. Here's why Tampa homeowners have especially strong grounds.</p>
          <div style={{display:"grid",gap:24}}>
            {[
              ["📊","Hillsborough County Property Appraiser Uses Mass Appraisal","Florida's TRIM notice arrives every August. Tampa homeowners have only 25 days to file a VAB petition — and Florida requires RECEIPT by the deadline, not just postmark. TaxAppeal files 7+ days early."],
              ["📈","Market Conditions Support Your Case","Tampa's explosive growth in neighborhoods like South Tampa, Hyde Park, Seminole Heights, and New Tampa has led to assessed values that often outpace actual market conditions."],
              ["⚖️","The Law Is On Your Side","Hillsborough County homeowners who recently purchased their home at post-peak prices have especially strong grounds for appeal, as assessments may reflect outdated peak valuations."],
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
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Filing With Hillsborough County Property Appraiser</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36}}>TaxAppeal files your appeal directly with the Hillsborough County appraisal authority via USPS certified mail with return receipt.</p>
          <div className="district-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,padding:24}}>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"1px",color:C.mutedGray,marginBottom:12}}>Appraisal Authority</div>
              <div style={{fontSize:16,fontWeight:600,color:C.darkNavy,marginBottom:16}}>Hillsborough County Property Appraiser</div>
              {[["📍","601 E Kennedy Blvd, Tampa, FL 33602"],["📞","(813) 272-6100"],["🌐","hcpafl.org"],["📅","Deadline: 25 days after your TRIM notice (typically mid-September)"],["⚖️","Florida Statute §194.011"]].map(([icon,text]) => (
                <div key={text} style={{display:"flex",gap:10,marginBottom:10,fontSize:13,color:C.bodyGray}}>
                  <span style={{flexShrink:0}}>{icon}</span><span>{text}</span>
                </div>
              ))}
            </div>
            <div style={{background:C.navy,borderRadius:12,padding:24,color:C.white}}>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"1px",color:C.gold,marginBottom:12}}>What TaxAppeal Does</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:C.gold,marginBottom:16}}>We Handle Everything</div>
              {["Analyze comparable sales in Tampa","Draft formal appeal letter citing Florida Statute §194.011","File via USPS certified mail with tracking","You receive copy and tracking number","Keep 100% of your savings"].map(item => (
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
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36}}>Most Tampa property tax firms charge 25-40% of your savings. Here's how TaxAppeal compares.</p>
          <div className="compare-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,padding:24}}>
              <div style={{fontSize:12,textTransform:"uppercase",letterSpacing:"1px",color:C.mutedGray,marginBottom:12}}>Typical Tampa Firm</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:"#C0392B",marginBottom:8}}>25-40% of savings</div>
              <p style={{fontSize:14,color:C.bodyGray,lineHeight:1.7,marginBottom:16}}>On a $2,200 reduction, that's $770 in fees — every year.</p>
              {["Contingency fee every year","May cherry-pick easy cases","You lose a large portion of savings"].map(item => (
                <div key={item} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:13,color:"#C0392B"}}>✗ {item}</div>
              ))}
            </div>
            <div style={{background:C.navy,borderRadius:12,padding:24}}>
              <div style={{fontSize:12,textTransform:"uppercase",letterSpacing:"1px",color:C.gold,marginBottom:12}}>TaxAppeal USA</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:C.gold,marginBottom:8}}>$79 flat. Period.</div>
              <p style={{fontSize:14,color:"#8596AF",lineHeight:1.7,marginBottom:16}}>Pay $79 once and keep every dollar of your $2,200 savings. No annual fees.</p>
              {["One-time $79 fee","Every property gets a full appeal","Keep 100% of your savings","Certified mail with return receipt"].map(item => (
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
        <p style={{fontSize:16,color:"#8596AF",marginBottom:28}}>Join Tampa homeowners saving money every year. $79 flat — no hidden fees, no percentage cuts.</p>
        <button className="btn-primary" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>Start My Tampa Appeal — $79 →</button>
      </section>

      <footer style={{background:C.darkNavy,padding:"24px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · disputes@taxappealusa.com</p>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {[["Texas","/texas"],["Georgia","/georgia"],["Florida","/florida"],["Houston","/houston"],["Dallas","/dallas"],["Fort Worth","/fort-worth"],["Austin","/austin"],["Atlanta","/atlanta"],["Miami","/miami"],["Tampa","/tampa"],["Terms","/terms"],["Privacy","/privacy"]].map(([label,href]) => (
            <a key={href} href={href} style={{color:C.mutedGray,fontSize:12,textDecoration:"none"}}>{label}</a>
          ))}
        </div>
      </footer>
    </>
  );
}
