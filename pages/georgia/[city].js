// pages/georgia/[city].js
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { getGaSuburbBySlug, getAllGaSuburbSlugs } from '../../lib/georgiaSuburbs';

import { C } from "../../lib/theme";
import LogoMark from '../../components/LogoMark';

export default function GeorgiaCityPage({ city }) {
  const [openFaq, setOpenFaq] = useState(null);
  if (!city) return <div>City not found</div>;
  const fSavings = city.avgSavings.toLocaleString();
  const fValue = city.medianValue.toLocaleString();

  const faqs = [
    { q:`How do I appeal my ${city.name} property taxes?`, a:`Send a written appeal (Form PT-311A or the county's own form) to the ${city.district} within 45 days of the date on your Notice of Assessment, under O.C.G.A. § 48-5-311. TaxAppeal USA checks first whether an appeal will actually lower your tax bill, after caps and exemptions. If it will, we mail you a ready-to-sign appeal kit for $89 — the form filled in, recent sales of similar homes, a checklist and a return envelope addressed to the ${city.district}. You sign it and mail it.` },
    { q:`How much can ${city.name} homeowners save?`, a:`It depends entirely on the gap between your assessment and your property's market value, and on whether the board grants a reduction — we cannot promise a number. As an illustration: a reduction worth $${fSavings} a year on a ${city.name} home would repay the $89 fee in the first year and keep saving after that, because TaxAppeal takes no percentage of it. We check whether an appeal would lower your bill before you pay, and we never promise a specific saving. Georgia does not publish appeal outcome statistics, so treat any service quoting you a Georgia success rate with caution.` },
    { q:`What is the appeal deadline for ${city.name}?`, a:`45 days from the date on your Notice of Assessment from the ${city.district}. The clock starts from the notice date — not when you receive it. Mail it so it is postmarked by then. Missing this means waiting a full year.` },
    { q:`Can my ${city.name} assessment go up if I appeal?`, a:`In rare cases, yes. Georgia does not prohibit assessment increases from appeals. TaxAppeal USA reviews recent sales of similar homes before preparing your kit, and if the evidence doesn't support a lower value we tell you and don't sell you one.` },
    { q:`What is the Board of Equalization in ${city.county} County?`, a:`The BOE is a three-member independent panel that hears formal property tax appeals. If the ${city.district} does not offer an acceptable reduction informally, your appeal proceeds to the BOE.` },
    { q:`Is the $89 fee worth it for ${city.name} homeowners?`, a:`We only sell the $89 kit after checking that an appeal would actually lower your bill. What it buys you is the appeal form filled in, the evidence attached, a checklist and a return envelope addressed to the ${city.district}; you sign it and mail it. If the county doesn't lower your value, next year's kit is free. The comparison worth making is against contingency firms, which charge 25-40% of whatever you save, every year: on a $${fSavings} reduction that is about $${Math.round(city.avgSavings*0.35).toLocaleString()} a year, forever. Ours is $89, once.` },
  ];

  const schema = { "@context":"https://schema.org","@type":"FAQPage","mainEntity":faqs.map(f=>({ "@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a} })) };
  const lbSchema = { "@context":"https://schema.org","@type":"LocalBusiness","name":"TaxAppeal USA","description":`Property tax appeal kits for ${city.name}, ${city.county} County, Georgia: we check first, then mail you a ready-to-sign appeal to sign and mail yourself`,"url":`https://www.taxappealusa.com/georgia/${city.slug}`,"areaServed":{"@type":"City","name":city.name,"containedInPlace":{"@type":"State","name":"Georgia"}},"offers":{"@type":"Offer","price":"89.00","priceCurrency":"USD"},"priceRange":"$89" };

  return (
    <>
      <Head>
        {/* Single template literal — see pages/florida/[city].js. The two-child form
            served `Rome<!-- --> Property Tax Appeal | ...`. */}
        <title>{`${city.name} Property Tax Appeal | $89 Flat Fee | TaxAppeal USA`}</title>
        <meta name="description" content={`Appeal your ${city.name} property taxes for $89 flat. We check first, then mail you a ready-to-sign appeal kit to sign and mail. 45-day deadline.`} />
        <link rel="canonical" href={`https://www.taxappealusa.com/georgia/${city.slug}`} key="canonical" />
        <meta property="og:title" content={`${city.name} Property Tax Appeal — $89 | TaxAppeal USA`} key="og:title" />
        <meta property="og:url" content={`https://www.taxappealusa.com/georgia/${city.slug}`} key="og:url" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(lbSchema) }} />
      </Head>
      {/* dangerouslySetInnerHTML, not a text child: React escapes ' & > in text and the client does not, so the two differ and hydration re-renders the whole root. See pages/apply.js. */}
      <style dangerouslySetInnerHTML={{ __html: `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}.container{max-width:900px;margin:0 auto;padding:0 24px;}.btn-gold{background:${C.gold};color:${C.darkNavy};border:none;border-radius:8px;padding:18px 44px;font-size:17px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;}.btn-primary{background:${C.navy};color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:500;cursor:pointer;}@media(max-width:768px){.hero-stats{grid-template-columns:1fr 1fr !important;}.hero-title{font-size:28px !important;}.steps-grid{grid-template-columns:1fr 1fr !important;}.info-grid{grid-template-columns:1fr !important;}}` }} />

      <div style={{background:C.white,borderBottom:`1.5px solid ${C.border}`,padding:"16px 40px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none"}}>
          <LogoMark />
          <div><div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:C.darkNavy}}>TaxAppeal USA</div><div style={{fontSize:9,textTransform:"uppercase",letterSpacing:"1.5px",color:C.mutedGray}}>Property Tax Dispute</div></div>
        </a>
        <Link href="/apply"><button className="btn-primary">Start my appeal →</button></Link>
      </div>

      <div style={{background:C.white,borderBottom:`1px solid ${C.border}`,padding:"10px 40px"}}>
        <div className="container" style={{padding:0}}>
          <p style={{fontSize:13,color:C.mutedGray}}>
            <a href="/" style={{color:C.mutedGray,textDecoration:"none"}}>Home</a>{" › "}
            <a href="/georgia" style={{color:C.mutedGray,textDecoration:"none"}}>Georgia</a>{" › "}
            <a href={`/counties/${city.countySlug}`} style={{color:C.mutedGray,textDecoration:"none"}}>{city.county} County</a>{" › "}
            <span style={{color:C.darkNavy}}>{city.name}</span>
          </p>
        </div>
      </div>

      <section style={{background:C.navy,padding:"64px 40px",color:C.white}}>
        <div className="container">
          <div style={{fontSize:12,color:C.gold,textTransform:"uppercase",letterSpacing:"2px",marginBottom:16}}>{city.name}, Georgia · {city.metro} Area · Property Tax Appeal</div>
          <h1 className="hero-title" style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,marginBottom:16}}>{city.name} Property Tax Appeal — $89 Flat Fee</h1>
          <p style={{fontSize:18,color:C.mutedGray,lineHeight:1.6,maxWidth:640,marginBottom:32}}>{city.description} We check whether an appeal will actually lower your tax bill, after caps and exemptions, before you pay. If it will, we mail you a ready-to-sign appeal kit for the {city.district} — a flat $89. You sign it and mail it.</p>
          <div className="hero-stats" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:32}}>
            {[["45 days","Appeal window"],["$89","Flat fee"],["0%","Of your savings taken"],[city.county+" Co.","Service area"]].map(([n,l])=>(
              <div key={l} style={{background:C.darkNavy,borderRadius:10,padding:"16px",textAlign:"center"}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:n.length>8?14:26,color:C.gold}}>{n}</div>
                <div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
          <Link href="/apply"><button className="btn-gold">Check My {city.name} Appeal — $89 →</button></Link>
          <div style={{fontSize:13,color:"#5A7A9F",marginTop:12}}>If it won&apos;t lower your bill, we&apos;ll tell you, and we won&apos;t sell you one. 45-day deadline from your notice date.</div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.white}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Why {city.name} Homeowners Should Appeal</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>Georgia assesses property at 40% of fair market value — when that estimate is wrong, you overpay every year until you appeal.</p>
          <div style={{display:"grid",gap:24}}>
            {[
              ["📊",`${city.district} Uses Mass Appraisal`,`The ${city.district} values thousands of properties using statistical models that apply broad market trends across entire neighborhoods. Your home's specific condition and location nuances are often missed — leading to inflated assessments.`],
              ["💰","High Stakes at Current Values",`With a median home value of $${fValue} in ${city.name}, even a 5% over-assessment means $${Math.round(city.medianValue*0.05*0.40*0.025).toLocaleString()} in excess annual taxes. Appealing is one of the highest-ROI decisions a Georgia homeowner can make.`],
              ["⚖️","Georgia Law Gives You 45 Days",`Under O.C.G.A. § 48-5-311, every ${city.county} County homeowner has the right to appeal within 45 days of their Notice of Assessment. TaxAppeal USA prepares the form and the evidence; you sign it and mail it.`],
            ].map(([icon,title,desc])=>(
              <div key={title} style={{display:"flex",gap:16}}>
                <div style={{width:44,height:44,background:C.lightBlue,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
                <div><h3 style={{fontSize:17,fontWeight:500,marginBottom:6}}>{title}</h3><p style={{fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.lightBlue}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>How TaxAppeal Works in {city.name}</h2>
          <div className="steps-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
            {[
              {n:"1",t:"We check first",d:`We compare your ${city.name} value with recent sales of similar homes in ${city.county} County and run your bill through the caps and exemptions. If an appeal won't lower your bill by more than our $89 fee, we tell you and don't sell you one.`},
              {n:"2",t:"We mail you the kit",d:`Your appeal on Form PT-311A or the county's own form, filled in, with the sales evidence, a checklist and a return envelope addressed to the ${city.district}. A PDF copy of the full kit is also emailed to you the same day.`},
              {n:"3",t:"You sign it and mail it",d:`Sign in ink, add a stamp and mail it so it is postmarked within 45 days of your notice date. The ${city.district} writes to you directly.`},
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

      <section style={{padding:"56px 40px",background:C.white}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>About the {city.district}</h2>
          <div className="info-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            {[
              ["📅","45-Day Appeal Deadline",`Your appeal must be postmarked within 45 days of the date on your Notice of Assessment from the ${city.district}. Ask the post office for a dated receipt as your own proof of mailing.`],
              ["📬","Where Your Appeal Goes",`You mail your signed appeal to the ${city.district} in the return envelope that comes in your kit. We do not file your appeal for you or contact the county.`],
              ["🏛️","The BOE Process",`If the ${city.district} does not offer an acceptable reduction, your appeal proceeds to the ${city.county} County Board of Equalization — a three-member independent panel. The county writes to you directly; forward us anything it sends and we'll help you understand it.`],
              ["⚠️","Georgia Risk Disclosure","Unlike Texas and Florida, Georgia does not prohibit assessment increases from appeals. TaxAppeal USA reviews the market data before preparing your kit, and won't sell you one if the evidence doesn't support a lower value."],
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

      <section style={{padding:"56px 40px",background:C.bg}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>$89 Flat vs. Contingency Firms</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>Many {city.name} property tax appeal services charge a percentage of your savings, every year. Ours is $89 for the kit, once.</p>
          {/* overflow-x so the table scrolls inside its own box instead of widening the page. */}
          <div style={{ overflowX: "auto" }}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:15,background:C.white,borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`}}>
              <thead><tr style={{background:C.navy,color:C.white}}><th style={{padding:"14px 20px",textAlign:"left"}}>Service</th><th style={{padding:"14px 20px",textAlign:"center"}}>Fee Structure</th><th style={{padding:"14px 20px",textAlign:"center"}}>Cost on $${fSavings} Win</th></tr></thead>
              <tbody>
                <tr style={{fontWeight:600}}><td style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,color:C.navy}}>✓ TaxAppeal USA</td><td style={{padding:"14px 20px",textAlign:"center",borderBottom:`1px solid ${C.border}`}}>$89 flat fee</td><td style={{padding:"14px 20px",textAlign:"center",borderBottom:`1px solid ${C.border}`,color:"#16a34a"}}>$89</td></tr>
                <tr style={{background:C.bg}}><td style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`}}>Contingency Appeal Firm</td><td style={{padding:"14px 20px",textAlign:"center",borderBottom:`1px solid ${C.border}`}}>25–35% of savings</td><td style={{padding:"14px 20px",textAlign:"center",borderBottom:`1px solid ${C.border}`,color:"#dc2626"}}>$${Math.round(city.avgSavings*0.30).toLocaleString()}</td></tr>
                <tr><td style={{padding:"14px 20px"}}>Property Tax Attorney</td><td style={{padding:"14px 20px",textAlign:"center"}}>40–50% of savings</td><td style={{padding:"14px 20px",textAlign:"center",color:"#dc2626"}}>$${Math.round(city.avgSavings*0.45).toLocaleString()}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.white}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,marginBottom:20}}>Georgia Property Tax Appeal Law</h2>
          <div style={{background:C.lightBlue,borderRadius:12,padding:"28px 32px",borderLeft:`4px solid ${C.navy}`}}>
            <p style={{fontSize:16,lineHeight:1.7,color:C.darkNavy,marginBottom:16}}>Under <strong>O.C.G.A. § 48-5-311</strong>, every {city.county} County homeowner has the legal right to appeal their property assessment within 45 days of their Notice of Assessment. Georgia assesses property at <strong>40% of estimated fair market value</strong>.</p>
            <p style={{fontSize:16,lineHeight:1.7,color:C.darkNavy,marginBottom:16}}>The appeal path: Board of Assessors informal review → Board of Equalization (BOE) → Superior Court. The <strong>postmark deadline</strong> controls in Georgia — mail your signed appeal in time and keep a dated post-office receipt.</p>
            <p style={{fontSize:16,lineHeight:1.7,color:C.darkNavy}}>Georgia does not prohibit assessment increases from appeals. TaxAppeal USA reviews recent sales of similar homes before preparing your kit. We do not file your appeal or represent you: you sign it and mail it yourself.</p>
          </div>
        </div>
      </section>

      <section style={{padding:"56px 40px",background:C.bg}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>{city.name} Property Tax Appeal FAQ</h2>
          {faqs.map((faq,i)=>(
            <div key={i} style={{background:C.white,border:`1.5px solid ${openFaq===i?C.navy:C.border}`,borderRadius:10,marginBottom:10,overflow:"hidden"}}>
              <div onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{padding:"16px 20px",fontSize:15,fontWeight:500,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                {faq.q}<span style={{color:C.mutedGray,transform:openFaq===i?"rotate(180deg)":"none",transition:"transform 0.2s",flexShrink:0,marginLeft:12}}>▾</span>
              </div>
              {openFaq===i&&<div style={{padding:"0 20px 16px",fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{faq.a}</div>}
            </div>
          ))}
        </div>
      </section>

      <section style={{background:C.navy,padding:"64px 40px",textAlign:"center"}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>Ready to appeal your {city.name} property taxes?</h2>
        <p style={{fontSize:16,color:C.mutedGray,marginBottom:28,maxWidth:560,margin:"0 auto 28px"}}>{city.name} homeowners — we check whether an appeal can actually lower your bill before you pay. $89 flat — 45-day deadline from your notice.</p>
        <Link href="/apply"><button className="btn-gold">Check My {city.name} Appeal — $89 →</button></Link>
        <p style={{fontSize:13,color:"#5A7A9F",marginTop:16}}>O.C.G.A. § 48-5-311 · {city.district} · You sign it and mail it</p>
      </section>

      <footer style={{background:C.darkNavy,padding:"24px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {[["Texas","/texas"],["Georgia","/georgia"],["Florida","/florida"],["Atlanta","/atlanta"],["Blog","/blog"],["Terms","/terms"],["Privacy","/privacy"]].map(([label,href])=>(
            <a key={href} href={href} style={{color:C.mutedGray,fontSize:12,textDecoration:"none"}}>{label}</a>
          ))}
        </div>
      </footer>
    </>
  );
}

export async function getStaticPaths() {
  const paths = getAllGaSuburbSlugs();
  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const city = getGaSuburbBySlug(params.city);
  if (!city) return { notFound: true };
  return { props: { city } };
}
