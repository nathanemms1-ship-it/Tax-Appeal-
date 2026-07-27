// pages/arkansas/[city].js
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { getArSuburbBySlug, getAllArSuburbSlugs } from '../../lib/arkansasSuburbs';

const C = { navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",lightBlue:"#EEF3FB",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF" };

export default function ArkansasCityPage({ city }) {
  const [openFaq, setOpenFaq] = useState(null);
  if (!city) return <div>City not found</div>;
  const fSavings = city.avgSavings.toLocaleString();
  const fValue = city.medianValue.toLocaleString();

  // Arkansas-specific annual tax estimate: 20% of market value × ~0.6% effective rate
  const annualTaxEstimate = Math.round(city.medianValue * 0.20 * 0.006);

  const faqs = [
    { q:`How do I appeal my ${city.name} property taxes?`, a:`File a formal protest with the ${city.county} County Board of Equalization (BOE) before the third Monday in August — August 17, 2026. TaxAppeal prepares your appeal letter with comparable sales evidence and mails it via USPS certified mail under Ark. Code §26-27-317.` },
    { q:`How much can ${city.name} homeowners save?`, a:`${city.name} homeowners who appeal successfully save an average of $${fSavings} per year. TaxAppeal's flat $89 fee means you keep 100% of those savings instead of paying a contingency firm 25–35%.` },
    { q:`What is the appeal deadline for ${city.name}?`, a:`The third Monday in August — August 17, 2026. Arkansas Code §26-27-317 requires protests to be filed with the Board of Equalization by this date. The postmark date controls, so TaxAppeal files certified mail well before the deadline.` },
    { q:`What is the Arkansas 20% assessment ratio?`, a:`Arkansas assesses residential property at 20% of its estimated fair market value. So a home valued at $${fValue} would have an assessed value of approximately $${Math.round(city.medianValue * 0.20).toLocaleString()}. Your appeal targets the full market value — even a 10% reduction cuts your tax bill by 10% every year.` },
    { q:`What is Amendment 79 and how does it affect my appeal?`, a:`Amendment 79 to the Arkansas Constitution caps homestead assessment increases at 5% per year regardless of actual market appreciation. For homeowners 65 and older, the assessed value is frozen entirely. Even if you have Amendment 79 protection, appealing can lock in a lower base value, reducing future increases.` },
    { q:`Does TaxAppeal serve ${city.county} County?`, a:`Yes — TaxAppeal serves all 75 Arkansas counties including ${city.county} County. Your appeal is filed with the ${city.district} and the ${city.county} County Board of Equalization.` },
    { q:`Can my assessment increase if I appeal?`, a:`Arkansas law does not prohibit increases from BOE appeals. However, the Board of Equalization's role is equalization, not raising values on appealing homeowners. TaxAppeal reviews all comparable sales data before filing to ensure your appeal is strongly supported.` },
    { q:`What evidence does TaxAppeal use?`, a:`We analyze recent comparable sales in your area under Ark. Code §26-26-1901 (market value standard), assess current market conditions in ${city.county} County, and include any property-specific defects you report. Every letter cites the controlling Arkansas statutes.` },
    { q:`Can I appeal every year in Arkansas?`, a:`Yes. Arkansas property owners can file a new appeal every year during the August equalization period. Rising markets create new over-assessments each cycle — TaxAppeal can file on your behalf annually.` },
  ];

  const schema = { "@context":"https://schema.org","@type":"FAQPage","mainEntity":faqs.map(f=>({ "@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a} })) };
  const lbSchema = { "@context":"https://schema.org","@type":"LocalBusiness","name":"TaxAppeal USA","description":`Property tax appeal service for ${city.name}, ${city.county} County, Arkansas`,"url":`https://www.taxappealusa.com/arkansas/${city.slug}`,"areaServed":{"@type":"City","name":city.name,"containedInPlace":{"@type":"State","name":"Arkansas"}},"offers":{"@type":"Offer","price":"89.00","priceCurrency":"USD"},"priceRange":"$89" };

  return (
    <>
      <Head>
        <title>{city.name} Property Tax Appeal | $89 Flat Fee | TaxAppeal USA</title>
        <meta name="description" content={`Appeal your ${city.name} property taxes for $89 flat. ${city.county} County homeowners save $${fSavings}/year on average. Certified mail filing. August 17 deadline.`} />
        <link rel="canonical" href={`https://www.taxappealusa.com/arkansas/${city.slug}`} />
        <meta property="og:title" content={`${city.name} Property Tax Appeal — $89 | TaxAppeal USA`} />
        <meta property="og:url" content={`https://www.taxappealusa.com/arkansas/${city.slug}`} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(lbSchema) }} />
      </Head>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}.container{max-width:900px;margin:0 auto;padding:0 24px;}.btn-gold{background:${C.gold};color:${C.darkNavy};border:none;border-radius:8px;padding:18px 44px;font-size:17px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;}.btn-primary{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:500;cursor:pointer;}@media(max-width:768px){.hero-stats{grid-template-columns:1fr 1fr !important;}.hero-title{font-size:28px !important;}.steps-grid{grid-template-columns:1fr 1fr !important;}.info-grid{grid-template-columns:1fr !important;}}`}</style>

      {/* Nav */}
      <div style={{background:C.white,borderBottom:`1.5px solid ${C.border}`,padding:"16px 40px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none"}}>
          <div style={{width:34,height:34,background:C.navy,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🏠</div>
          <div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:C.darkNavy}}>TaxAppeal USA</div><div style={{fontSize:9,textTransform:"uppercase",letterSpacing:"1.5px",color:C.mutedGray}}>Property Tax Dispute</div></div>
        </a>
        <Link href="/apply"><button className="btn-primary">Start my appeal →</button></Link>
      </div>

      {/* Breadcrumb */}
      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"10px 40px"}}>
        <div className="container" style={{padding:0}}>
          <p style={{fontSize:13,color:C.mutedGray}}>
            <a href="/" style={{color:C.mutedGray,textDecoration:"none"}}>Home</a>{" › "}
            <a href="/arkansas" style={{color:C.mutedGray,textDecoration:"none"}}>Arkansas</a>{" › "}
            <a href={`/counties/${city.countySlug}`} style={{color:C.mutedGray,textDecoration:"none"}}>{city.county} County</a>{" › "}
            <span style={{color:C.darkNavy}}>{city.name}</span>
          </p>
        </div>
      </div>

      {/* Hero */}
      <section style={{background:C.navy,padding:"64px 40px",color:C.white}}>
        <div className="container">
          <div style={{fontSize:12,color:C.gold,textTransform:"uppercase",letterSpacing:"2px",marginBottom:16}}>{city.name}, Arkansas · {city.metro} Area · Property Tax Appeal</div>
          <h1 className="hero-title" style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,marginBottom:16}}>{city.name} Property Tax Appeal — $89 Flat Fee</h1>
          <p style={{fontSize:18,color:"#8596AF",lineHeight:1.6,maxWidth:640,marginBottom:32}}>{city.description} TaxAppeal files your formal protest with the {city.district} — backed by comparable sales data and certified mail — for a flat $89.</p>
          <div className="hero-stats" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:32}}>
            {[["Aug 17","BOE deadline"],[`$${fSavings}`,"Avg. annual savings"],["$89","Flat fee"],[city.county+" Co.","Service area"]].map(([n,l])=>(
              <div key={l} style={{background:"#0F1F3D",borderRadius:10,padding:"16px",textAlign:"center"}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:n.length>8?14:26,color:C.gold}}>{n}</div>
                <div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
          <Link href="/apply"><button className="btn-gold">File My {city.name} Appeal — $89 →</button></Link>
          <div style={{fontSize:13,color:"#5A7A9F",marginTop:12}}>Takes about 4 minutes. August 17, 2026 deadline with the {city.county} County BOE.</div>
        </div>
      </section>

      {/* Why appeal */}
      <section style={{padding:"56px 40px",background:C.white}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Why {city.name} Homeowners Should Appeal</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>Arkansas assesses property at 20% of fair market value — when that estimate is wrong, you overpay every year until you appeal.</p>
          <div style={{display:"grid",gap:24}}>
            {[
              ["📊",`${city.district} Uses Mass Appraisal`,`The ${city.district} values thousands of properties using statistical models that apply broad market trends across entire neighborhoods. Your home's specific condition, lot features, and location nuances are often missed — leading to inflated assessments that cost you money every year.`],
              ["💰","High Stakes at Current Values",`With a median home value of $${fValue} in ${city.name}, even a 5% over-assessment means roughly $${Math.round(city.medianValue*0.05*0.20*0.006).toLocaleString()} in excess annual taxes. Appealing is one of the highest-ROI decisions a ${city.county} County homeowner can make.`],
              ["📅","Arkansas Gives You One Window Per Year",`Under Ark. Code §26-27-317, every ${city.county} County homeowner can protest before the Board of Equalization by the third Monday in August. Miss that window and you wait a full year. TaxAppeal handles the evidence, letter, and certified mail filing.`],
            ].map(([icon,title,desc])=>(
              <div key={title} style={{display:"flex",gap:16}}>
                <div style={{width:44,height:44,background:C.lightBlue,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
                <div><h3 style={{fontSize:17,fontWeight:500,marginBottom:6}}>{title}</h3><p style={{fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{padding:"56px 40px",background:C.lightBlue}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>How TaxAppeal Works in {city.name}</h2>
          <div className="steps-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:20}}>
            {[
              {n:"1",t:"Enter Your Address",d:`Provide your ${city.name} property address. TaxAppeal pulls your current ${city.district} assessed value automatically.`},
              {n:"2",t:"We Build Your Case",d:`Our system compiles comparable sales from ${city.county} County and generates a formal protest letter citing Ark. Code §26-27-317 and §26-26-1901.`},
              {n:"3",t:"We Mail via Certified Mail",d:`Your protest is printed and mailed to the ${city.district} via USPS Certified Mail with Return Receipt — documented proof of timely filing.`},
              {n:"4",t:"You Save Money",d:`The ${city.county} County Board of Equalization reviews your evidence. If the assessment is not corrected, you can escalate to Circuit Court.`},
            ].map(s=>(
              <div key={s.n} style={{background:C.white,borderRadius:12,padding:24,textAlign:"center",border:`1px solid ${C.border}`}}>
                <div style={{width:44,height:44,background:C.navy,color:C.gold,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Serif Display',serif",fontSize:20,margin:"0 auto 16px"}}>{s.n}</div>
                <h3 style={{fontSize:15,fontWeight:500,marginBottom:8}}>{s.t}</h3>
                <p style={{fontSize:13,color:C.bodyGray,lineHeight:1.6}}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Assessment details */}
      <section style={{padding:"56px 40px",background:C.white}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>About the {city.district}</h2>
          <div className="info-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            {[
              ["📅","August 17, 2026 Deadline",`Your protest must be filed with the ${city.county} County Board of Equalization by August 17, 2026 — the third Monday in August per Ark. Code §26-27-317. TaxAppeal files certified mail to document timely filing.`],
              ["📬","How TaxAppeal Files",`We mail your protest letter with comparable sales evidence via USPS Certified Mail with Return Receipt to the ${city.district} — a legally documented record your protest was postmarked before the deadline.`],
              ["🏛️","The Board of Equalization",`The ${city.county} County Board of Equalization (BOE) is a three-member panel appointed by the county judge. It hears valuation protests in August and is an informal process — you present evidence and the BOE decides.`],
              ["🏠","Arkansas 20% Assessment Ratio","Arkansas residential property is assessed at 20% of fair market value. So the fight is really about the market value estimate — every dollar of reduction at market value translates directly to a lower tax bill."],
            ].map(([icon,title,desc])=>(
              <div key={title} style={{background:C.lightBlue,borderRadius:12,padding:24}}>
                <div style={{fontSize:24,marginBottom:10}}>{icon}</div>
                <h3 style={{fontSize:15,fontWeight:500,marginBottom:8}}>{title}</h3>
                <p style={{fontSize:13,color:C.bodyGray,lineHeight:1.7}}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Amendment 79 callout */}
      <section style={{padding:"48px 40px",background:C.bg}}>
        <div className="container">
          <div style={{background:C.lightBlue,border:`1.5px solid ${C.navy}`,borderRadius:12,padding:"28px 32px",borderLeft:`4px solid ${C.gold}`}}>
            <div style={{fontSize:12,color:C.gold,textTransform:"uppercase",letterSpacing:"1.5px",fontWeight:500,marginBottom:10}}>⚖️ Arkansas Amendment 79 — Important for Homeowners</div>
            <p style={{fontSize:15,lineHeight:1.7,color:C.darkNavy,marginBottom:12}}><strong>Amendment 79</strong> caps homestead assessment increases at <strong>5% per year</strong>, regardless of how much the market rises. For homeowners age <strong>65 and older</strong>, the assessed value is frozen entirely — it cannot increase as long as you remain in your home.</p>
            <p style={{fontSize:15,lineHeight:1.7,color:C.darkNavy}}>Even with Amendment 79 protection, appealing makes sense: <strong>a successful appeal lowers your base value</strong>, which reduces the ceiling that future 5% increases compound from — and can unlock additional savings every year. TaxAppeal reviews your current assessed value alongside your Amendment 79 history before filing.</p>
          </div>
        </div>
      </section>

      {/* Fee comparison */}
      <section style={{padding:"56px 40px",background:C.white}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>$89 Flat vs. Contingency Firms</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>Most Arkansas property tax appeal firms charge a percentage of your first-year savings — every year.</p>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:15,background:C.white,borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`}}>
            <thead><tr style={{background:C.navy,color:C.white}}><th style={{padding:"14px 20px",textAlign:"left"}}>Service</th><th style={{padding:"14px 20px",textAlign:"center"}}>Fee Structure</th><th style={{padding:"14px 20px",textAlign:"center"}}>Cost on $${fSavings} Win</th></tr></thead>
            <tbody>
              <tr style={{fontWeight:600}}><td style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,color:C.navy}}>✓ TaxAppeal USA</td><td style={{padding:"14px 20px",textAlign:"center",borderBottom:`1px solid ${C.border}`}}>$89 flat fee</td><td style={{padding:"14px 20px",textAlign:"center",borderBottom:`1px solid ${C.border}`,color:"#16a34a"}}>$89</td></tr>
              <tr style={{background:C.bg}}><td style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`}}>Contingency Appeal Firm</td><td style={{padding:"14px 20px",textAlign:"center",borderBottom:`1px solid ${C.border}`}}>25–35% of savings</td><td style={{padding:"14px 20px",textAlign:"center",borderBottom:`1px solid ${C.border}`,color:"#dc2626"}}>$${Math.round(city.avgSavings*0.30).toLocaleString()}</td></tr>
              <tr><td style={{padding:"14px 20px"}}>Property Tax Attorney</td><td style={{padding:"14px 20px",textAlign:"center"}}>40–50% of savings</td><td style={{padding:"14px 20px",textAlign:"center",color:"#dc2626"}}>$${Math.round(city.avgSavings*0.45).toLocaleString()}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Law section */}
      <section style={{padding:"56px 40px",background:C.bg}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,marginBottom:20}}>Arkansas Property Tax Appeal Law</h2>
          <div style={{background:C.lightBlue,borderRadius:12,padding:"28px 32px",borderLeft:`4px solid ${C.navy}`}}>
            <p style={{fontSize:16,lineHeight:1.7,color:C.darkNavy,marginBottom:16}}>Under <strong>Ark. Code §26-27-317</strong>, every {city.county} County homeowner has the right to protest their assessment before the Board of Equalization by the third Monday in August. Arkansas assesses residential property at <strong>20% of estimated fair market value</strong> under §26-26-1901.</p>
            <p style={{fontSize:16,lineHeight:1.7,color:C.darkNavy,marginBottom:16}}>The appeal path in Arkansas: written protest to the Board of Equalization → BOE hearing → Circuit Court. The <strong>postmark deadline</strong> controls — TaxAppeal files certified mail to document timely filing.</p>
            <p style={{fontSize:16,lineHeight:1.7,color:C.darkNavy}}>Amendment 79 caps homestead assessment increases at 5% per year (frozen for 65+ owners). A successful appeal lowers your base value and reduces future compounding increases.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{padding:"56px 40px",background:C.white}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>{city.name} Property Tax Appeal FAQ</h2>
          {faqs.map((faq,i)=>(
            <div key={i} style={{background:C.bg,border:`1.5px solid ${openFaq===i?C.navy:C.border}`,borderRadius:10,marginBottom:10,overflow:"hidden"}}>
              <div onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{padding:"16px 20px",fontSize:15,fontWeight:500,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                {faq.q}<span style={{color:C.mutedGray,transform:openFaq===i?"rotate(180deg)":"none",transition:"transform 0.2s",flexShrink:0,marginLeft:12}}>▾</span>
              </div>
              {openFaq===i&&<div style={{padding:"0 20px 16px",fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{faq.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{background:C.navy,padding:"64px 40px",textAlign:"center"}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>Ready to appeal your {city.name} property taxes?</h2>
        <p style={{fontSize:16,color:"#8596AF",marginBottom:28,maxWidth:560,margin:"0 auto 28px"}}>{city.name} homeowners save an average of $${fSavings}/year. $89 flat — August 17, 2026 BOE deadline.</p>
        <Link href="/apply"><button className="btn-gold">File My {city.name} Appeal — $89 →</button></Link>
        <p style={{fontSize:13,color:"#5A7A9F",marginTop:16}}>Ark. Code §26-27-317 · {city.district} · USPS Certified Mail Filing</p>
      </section>

      {/* Footer */}
      <footer style={{background:C.darkNavy,padding:"24px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {[["Texas","/texas"],["Arkansas","/arkansas"],["Georgia","/georgia"],["Florida","/florida"],["Blog","/blog"],["Terms","/terms"],["Privacy","/privacy"]].map(([label,href])=>(
            <a key={href} href={href} style={{color:C.mutedGray,fontSize:12,textDecoration:"none"}}>{label}</a>
          ))}
        </div>
      </footer>
    </>
  );
}

export async function getStaticPaths() {
  const paths = getAllArSuburbSlugs();
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const city = getArSuburbBySlug(params.city);
  if (!city) return { notFound: true };
  return { props: { city } };
}
