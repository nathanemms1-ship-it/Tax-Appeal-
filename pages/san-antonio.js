import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Breadcrumb from '../components/Breadcrumb';
import { currentTaxYear, deadlineSentence, deadlineShort } from '../lib/tx/protestDeadline';
import { SITE_ORIGIN } from '../lib/breadcrumbs';

const C = { navy:"#1B3A6B",gold:"#FFC940",darkNavy:"#0F1F3D",bg:"#F4F7FC",lightBlue:"#EEF3FB",bodyGray:"#5A6B82",mutedGray:"#8596AF",border:"#E8EDF4",white:"#FFFFFF",green:"#2E7D52" };
const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');`;

/* Derived, not typed. The deadline tile below read "2026 Protest Deadline /
   May 15, 2026" until 22 Aug 2026 — three months after that deadline passed.
   Declared ABOVE `faqs` deliberately: `faqs` interpolates DEADLINE at module
   evaluation, so a declaration below it is a temporal-dead-zone crash at build,
   not a lint nit. scripts/verify-tdz.mjs exists because of this class of bug. */
const TAX_YEAR = currentTaxYear();
const DEADLINE = deadlineShort(TAX_YEAR);
const DEADLINE_SENTENCE = deadlineSentence(TAX_YEAR, 'Bexar Central Appraisal District');

const faqs = [
  ["How do I protest my San Antonio property taxes?",`You file a formal protest with the Bexar Central Appraisal District (BCAD) by ${DEADLINE} or 30 days after your Notice of Appraised Value, whichever is later. TaxAppeal prepares your protest letter with comparable sales evidence and files it via USPS certified mail — creating legal proof of timely filing.`],
  ["What is BCAD and how does it affect my taxes?","BCAD (Bexar Central Appraisal District) is the government agency that appraises all properties in Bexar County. Your BCAD assessed value directly determines your property tax bill. If BCAD overestimates your value, you overpay — and you have the legal right to protest every year."],
  ["How much can San Antonio homeowners save by protesting?","Any reduction applies to your assessed value, and your saving is that reduction multiplied by your local tax rate. With TaxAppeal's flat $89 fee, you keep 100% of those savings — unlike contingency firms that take 25–40% of what you save."],
  ["Do I need to attend a BCAD hearing?","Not necessarily. Many protests are resolved at the informal level before a formal ARB hearing is required. TaxAppeal's certified mail filing creates an official record of your protest with BCAD."],
  ["What is the San Antonio property tax protest deadline?",`The deadline is ${DEADLINE} or 30 days after your Notice of Appraised Value is mailed by BCAD, whichever is later. Missing this deadline means waiting a full year to challenge your assessment.`],
];


export default function SanAntonio() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState(null);
  const go = () => router.push('/apply');

  return (
    <>
      <Head>
        <title>San Antonio Property Tax Protest Service | File for $89 | TaxAppeal USA</title>
        <meta name="description" content="Protest your San Antonio property taxes for $89 flat. We check whether a protest can actually lower your bill before you pay. We file with BCAD via certified mail. No percentage cuts." />
        <link rel="canonical" href="https://www.taxappealusa.com/san-antonio" key="canonical" />
        <meta property="og:title" content="San Antonio Property Tax Protest — $89 Flat Fee | TaxAppeal USA" key="og:title" />
        <meta property="og:description" content="Protest your San Antonio property taxes for $89 flat. We check whether a protest can actually lower your bill before you pay. We file with BCAD via certified mail. No percentage cuts." key="og:description" />
        <meta property="og:url" content="https://www.taxappealusa.com/san-antonio" key="og:url" />
        <meta property="og:type" content="website" key="og:type" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context":"https://schema.org","@type":"FAQPage",
          "mainEntity": faqs.map(([q,a]) => ({"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}}))
        })}} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context":"https://schema.org","@type":"Service",
          "name":"San Antonio Property Tax Protest Filing",
          "provider":{"@type":"Organization","name":"TaxAppeal USA"},
          "areaServed":{"@type":"City","name":"San Antonio"},
          "description":"Property tax protest letter preparation and USPS certified mail filing for San Antonio homeowners.",
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

      {/* Nav */}
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

      {/* Hero */}

      <Breadcrumb
        trail={[
          { name: 'Home', href: '/' },
          { name: 'Texas', href: '/texas' },
          { name: 'Bexar County', href: '/counties/bexar-county-tx' },
          { name: 'San Antonio' },
        ]}
        selfUrl={`${SITE_ORIGIN}/san-antonio`}
      />

      <section style={{background:C.navy,padding:"64px 40px",color:C.white}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{fontSize:12,color:C.gold,textTransform:"uppercase",letterSpacing:"2px",marginBottom:16}}>San Antonio, Texas — Property Tax Protest Service</div>
          <h1 className="hero-title" style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,marginBottom:16}}>San Antonio Property Tax Protest — $89 Flat Fee</h1>
          <p style={{fontSize:18,color:"#8596AF",lineHeight:1.6,maxWidth:640,marginBottom:32}}>Bexar County homeowners pay some of the highest effective property tax rates in Texas. TaxAppeal files your formal protest with BCAD — backed by comparable sales data and certified mail — for a flat $89.</p>
          <div className="hero-stats" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:32}}>
            {[["$89","Flat fee"],["0%","Of your savings taken"],["Certified","Mail with tracking"],["Bexar County","Service area"]].map(([n,l]) => (
              <div key={l} style={{background:"#0F1F3D",borderRadius:10,padding:"16px",textAlign:"center"}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:n.length>8?14:28,color:C.gold}}>{n}</div>
                <div style={{fontSize:11,color:"#5A7A9F",marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
          <button className="btn-primary" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>File My San Antonio Protest — $89 →</button>
          <div style={{fontSize:13,color:"#5A7A9F",marginTop:12}}>Takes about 4 minutes. You won't be charged until your letter is ready.</div>
        </div>
      </section>

      {/* Why File */}
      <section style={{padding:"56px 40px",background:C.white}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>Why San Antonio Homeowners Should File</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>Texas gives you the right to protest your appraised value every single year, at no cost to file. Here's why San Antonio homeowners have especially strong grounds.</p>
          <div style={{display:"grid",gap:24}}>
            {[
              ["📊","Bexar Central Appraisal District Uses Mass Appraisal","BCAD appraises over 700,000 properties annually using mass-appraisal methods that apply broad neighborhood trends rather than assessing each home individually — leading to systematic over-valuation for many homeowners."],
              ["📈","San Antonio's Rapid Growth Works Against You","San Antonio has been one of America's fastest-growing cities for a decade. BCAD's models often lag market corrections, leaving thousands of homeowners assessed above their property's actual current value."],
              ["⚖️","Texas Law Guarantees Your Right to Protest","Under Texas Tax Code §41.41, every Bexar County homeowner has the legal right to protest their assessed value every year. You don't need an attorney — just evidence. TaxAppeal builds it, you sign the protest, and we file it."],
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

      {/* BCAD Info */}
      <section style={{padding:"56px 40px",background:C.lightBlue}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:12}}>About the Bexar Central Appraisal District</h2>
          <p style={{fontSize:15,color:C.bodyGray,textAlign:"center",marginBottom:36,lineHeight:1.7}}>BCAD handles property valuations for all of Bexar County including San Antonio, Helotes, Leon Valley, Converse, Universal City, Schertz, and surrounding communities.</p>
          <div className="district-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            {[
              ["📅", `${TAX_YEAR} Protest Deadline`, `${DEADLINE_SENTENCE} File early — BCAD informal hearings fill up fast.`],
              ["📬","How TaxAppeal Files","We prepare a protest letter with comparable sales evidence and mail it via USPS Certified Mail with Return Receipt to BCAD — creating irrefutable legal proof of your timely filing."],
              ["🏘️","Areas Served","All Bexar County municipalities: San Antonio, Helotes, Leon Valley, Converse, Universal City, Schertz, Live Oak, Selma, Kirby, and all unincorporated areas."],
              ["📋","What Happens After Filing","BCAD schedules an informal hearing where most cases settle. If not, your case goes to the Appraisal Review Board (ARB). TaxAppeal notifies you at each stage."],
            ].map(([icon,title,desc]) => (
              <div key={title} style={{background:C.white,borderRadius:12,padding:24,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:24,marginBottom:10}}>{icon}</div>
                <h3 style={{fontSize:15,fontWeight:500,marginBottom:8}}>{title}</h3>
                <p style={{fontSize:13,color:C.bodyGray,lineHeight:1.7}}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compare */}
      <section style={{padding:"56px 40px",background:C.white}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>$89 Flat vs. Contingency Firms</h2>
          <div className="compare-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div style={{background:"#FFF8F8",border:"1.5px solid #F5C6C6",borderRadius:12,padding:24}}>
              <div style={{fontSize:12,textTransform:"uppercase",letterSpacing:"1px",color:"#C0392B",marginBottom:12}}>Contingency Firms</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:"#C0392B",marginBottom:8}}>25–40% of savings</div>
              <p style={{fontSize:14,color:C.bodyGray,lineHeight:1.7,marginBottom:16}}>On a $1,400 reduction that's up to $560 taken before it reaches you — every single year.</p>
              {["Contingency fee every year","May cherry-pick easy cases","You lose a large portion of savings"].map(item => (
                <div key={item} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:13,color:"#C0392B"}}>✗ {item}</div>
              ))}
            </div>
            <div style={{background:C.navy,borderRadius:12,padding:24}}>
              <div style={{fontSize:12,textTransform:"uppercase",letterSpacing:"1px",color:C.gold,marginBottom:12}}>TaxAppeal USA</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:C.gold,marginBottom:8}}>$89 flat. Period.</div>
              <p style={{fontSize:14,color:"#8596AF",lineHeight:1.7,marginBottom:16}}>Pay $89 once and keep every dollar of your $1,400 savings. No annual fees.</p>
              {["One-time $89 fee","Every property gets a full protest","Keep 100% of your savings","Certified mail with return receipt"].map(item => (
                <div key={item} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,fontSize:13,color:C.gold}}>✓ {item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{padding:"56px 40px",background:C.bg}}>
        <div style={{maxWidth:800,margin:"0 auto"}}>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,textAlign:"center",marginBottom:36}}>San Antonio Property Tax Protest FAQ</h2>
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

      {/* CTA */}
      <section style={{background:C.navy,padding:"64px 40px",textAlign:"center"}}>
        <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:34,color:C.white,marginBottom:12}}>Ready to protest your San Antonio property taxes?</h2>
        <p style={{fontSize:16,color:"#8596AF",marginBottom:28}}>Join San Antonio homeowners saving money every year. $89 flat — no hidden fees, no percentage cuts.</p>
        <button className="btn-primary" style={{background:C.gold,color:C.darkNavy,fontSize:17,padding:"18px 44px"}} onClick={go}>Start My San Antonio Protest — $89 →</button>
      </section>

      {/* Footer */}
      <footer style={{background:C.darkNavy,padding:"24px 40px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
        <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
          {[["Texas","/texas"],["Georgia","/georgia"],["Florida","/florida"],["Houston","/houston"],["Dallas","/dallas"],["Fort Worth","/fort-worth"],["Austin","/austin"],["San Antonio","/san-antonio"],["Atlanta","/atlanta"],["Miami","/miami"],["Tampa","/tampa"],["Terms","/terms"],["Privacy","/privacy"]].map(([label,href]) => (
            <a key={href} href={href} style={{color:C.mutedGray,fontSize:12,textDecoration:"none"}}>{label}</a>
          ))}
        </div>
      </footer>
    </>
  );
}
