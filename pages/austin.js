import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';

const C = { navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",lightBlue:"#EEF3FB",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF",green:"#2E7D52" };
const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;
const faqs = [["How do I protest my Austin property taxes?","File a formal protest with Travis Central Appraisal District (TCAD) by May 15 or 30 days after your Notice of Appraised Value. TaxAppeal prepares your protest letter with comparable sales and files via USPS certified mail."],["What is TCAD?","TCAD (Travis Central Appraisal District) appraises all properties in Travis County. Your TCAD assessed value determines your Austin property tax bill. If it's too high, you can protest under Texas Tax Code §41.41."],["How much can Austin homeowners save?","Austin homeowners save an average of $2,400 per year when they successfully protest — the highest average in Texas due to high home values. TaxAppeal charges $89 flat."],["Is Austin's real estate correction helping homeowners protest?","Yes. If your home was assessed at peak 2022 values but the market has since corrected, you have strong grounds to protest. Comparable sales from the past 12 months showing lower values are powerful evidence."],["What is the Austin property tax protest deadline?","May 15 or 30 days after TCAD mails your Notice of Appraised Value, whichever is later."]];

export default function Austin() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState(null);
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>Austin Property Tax Protest Service | File for $89 | TaxAppeal USA</title>
        <meta name="description" content="Protest your Austin property taxes for $89 flat. Travis County homeowners save an average of $2,400/year. We mail your protest to TCAD via certified mail. No percentage cuts." />
        <link rel="canonical" href="https://www.taxappealusa.com/austin" />
        <meta property="og:title" content="Austin Property Tax Protest — $89 Flat Fee | TaxAppeal USA" />
        <meta property="og:description" content="Protest your Austin property taxes for $89 flat. Travis County homeowners save an average of $2,400/year. We mail your protest to TCAD via certified mail. No percentage cuts." />
        <meta property="og:url" content="https://www.taxappealusa.com/austin" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context":"https://schema.org","@type":"FAQPage",
          "mainEntity": faqs.map(([q,a]) => ({"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}}))
        })}} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context":"https://schema.org","@type":"Service",
          "name":"Austin Property Tax Protest Filing",
          "provider":{"@type":"Organization","name":"TaxAppeal USA"},
          "areaServed":{"@type":"City","name":"Austin"},
          "description":"Property tax protest letter preparation and USPS certified mail filing for Austin homeowners.",
          "offers":{"@type":"Offer","price":"89.00","priceCurrency":"USD"}
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
        <button className="btn-primary" style={{padding:"10px 22px",fontSize:14}} onClick={go}>Start my protest →</button>
      </div>

      <section style={{background:C.navy,padding:"64px 40px",color:C.white}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{fontSize:12,color:C.gold,textTransform:"uppercase",letterSpacing:"2px",marginBottom:16}}>Austin, Texas — Property Tax Protest Service</div>
          <h1 className="hero-title" style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,marginBottom:16}}>Austin Property Tax Protest — $89 Flat Fee</h1>
          <p style={{fontSize:18,color:"#8596AF",lineHeight:1.6,maxWidth:640,marginBottom:32}}>Austin home values surged dramatically in recent years and are now correcting — meaning many Travis County homeowners are significantly over-assessed. TaxAppeal files your TCAD protest for a flat $89.</p>
          <div className="hero-stats" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:32}}>
            {[["82%","Approval rate"],["$2,400","Avg. savings"],["$89","Flat fee"],["Travis County","Service area"]].map(([n,l]) => (
              <div key={l} style={{background:"#0F1F3D",borderRadius:10,padding:"16px",textAlign:"center"}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:n.length>8?14:28,color:C.gold}}>{n}</div>
                <div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>File My Austin Protest — $89 →</button>
          <div style={{fontSize:13,color:"#5A7A9F",marginTop:12}}>Takes about 4 minutes. You won't be charged until your letter is ready.</div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.white}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Why Austin Homeowners Should File</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>82% of Texas property tax protests result in a reduction. Here's why Austin homeowners have especially strong grounds.</p>
          <div style={{display:"grid",gap:24}}>
            {[
              ["📊","Travis Central Appraisal District (TCAD) Uses Mass Appraisal","Austin's real estate market saw some of the steepest appreciation in the country followed by significant corrections — creating major over-assessment opportunities for homeowners who protest."],
              ["📈","Market Conditions Support Your Case","TCAD appraises over 400,000 properties in Travis County. Rapidly shifting market conditions make accurate mass-appraisal especially difficult, benefiting homeowners who protest with current comparable sales."],
              ["⚖️","The Law Is On Your Side","Austin homeowners with high assessed values have the most to gain from protesting — even a small percentage reduction on a high-value home translates to hundreds or thousands in annual savings."],
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
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Filing With Travis Central Appraisal District (TCAD)</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36}}>TaxAppeal files your protest directly with the Travis County appraisal authority via USPS certified mail with return receipt.</p>
          <div className="district-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,padding:24}}>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"1px",color:C.mutedGray,marginBottom:12}}>Appraisal Authority</div>
              <div style={{fontSize:16,fontWeight:600,color:C.darkNavy,marginBottom:16}}>Travis Central Appraisal District (TCAD)</div>
              {[["📍","850 E Anderson Ln, Austin, TX 78752"],["📞","(512) 834-9138"],["🌐","traviscad.org"],["📅","Deadline: May 15 or 30 days after your Notice of Appraised Value"],["⚖️","Texas Tax Code §41.41 & §41.43"]].map(([icon,text]) => (
                <div key={text} style={{display:"flex",gap:10,marginBottom:10,fontSize:13,color:C.bodyGray}}>
                  <span style={{flexShrink:0}}>{icon}</span><span>{text}</span>
                </div>
              ))}
            </div>
            <div style={{background:C.navy,borderRadius:12,padding:24,color:C.white}}>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"1px",color:C.gold,marginBottom:12}}>What TaxAppeal Does</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:C.gold,marginBottom:16}}>We Handle the Paperwork</div>
              {["Analyze comparable sales in Austin","Draft formal protest letter citing Texas Tax Code §41.41 & §41.43","File via USPS certified mail with tracking","You receive copy and tracking number","Keep 100% of your savings"].map(item => (
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
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>TaxAppeal vs. Other Austin Tax Protest Companies</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36}}>Most Austin property tax firms charge 25-40% of your savings. Here's how TaxAppeal compares.</p>
          <div className="compare-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div style={{background:C.white,border:`1.5px solid ${C.border}`,borderRadius:12,padding:24}}>
              <div style={{fontSize:12,textTransform:"uppercase",letterSpacing:"1px",color:C.mutedGray,marginBottom:12}}>Typical Austin Firm</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:"#C0392B",marginBottom:8}}>25-40% of savings</div>
              <p style={{fontSize:14,color:C.bodyGray,lineHeight:1.7,marginBottom:16}}>On a $2,400 reduction, that's $840 in fees — every year.</p>
              {["Contingency fee every year","May cherry-pick easy cases","You lose a large portion of savings"].map(item => (
                <div key={item} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:13,color:"#C0392B"}}>✗ {item}</div>
              ))}
            </div>
            <div style={{background:C.navy,borderRadius:12,padding:24}}>
              <div style={{fontSize:12,textTransform:"uppercase",letterSpacing:"1px",color:C.gold,marginBottom:12}}>TaxAppeal USA</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:C.gold,marginBottom:8}}>$89 flat. Period.</div>
              <p style={{fontSize:14,color:"#8596AF",lineHeight:1.7,marginBottom:16}}>Pay $89 once and keep every dollar of your $2,400 savings. No annual fees.</p>
              {["One-time $89 fee","Every property gets a full protest","Keep 100% of your savings","Certified mail with return receipt"].map(item => (
                <div key={item} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:13,color:C.gold}}>✓ {item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.bg}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>Austin Property Tax Protest FAQ</h2>
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
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>Ready to protest your Austin property taxes?</h2>
        <p style={{fontSize:16,color:"#8596AF",marginBottom:28}}>Join Austin homeowners saving money every year. $89 flat — no hidden fees, no percentage cuts.</p>
        <button className="btn-primary" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>Start My Austin Protest — $89 →</button>
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
