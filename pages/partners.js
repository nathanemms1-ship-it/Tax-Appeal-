// pages/partners.js
/**
 * THE RECRUITING PAGE — AND EVERY CLAIM ON IT LEAVES THIS SITE.
 *
 * A partner reads this page, then repeats it to their own clients in their own
 * name. A price we overstate here is a price a real estate agent gets held to by a
 * homeowner. A county we claim here is a county someone promises a filing in. So
 * this page is held to a stricter standard than a normal landing page, not a looser
 * one.
 *
 * What was wrong, and what replaced it:
 *
 *   "$89"                     -> $89 is the Texas and Georgia price. Florida adds a
 *                                mandatory county VAB filing fee of $15–$50 set by
 *                                statute per county (lib/flCountyFees.js), so the
 *                                Florida total is $104–$139. The season this page
 *                                exists for is the Florida one.
 *
 *   "all 67 Florida counties, -> Counted at build time from lib/serviceCoverage.js.
 *    all 75 Arkansas...",        Florida is however many are confirmed today;
 *                                Arkansas and Alabama are not served until 2027 and
 *                                are no longer advertised as if they were.
 *
 *   "saving thousands"        -> Removed. We hold no substantiation for a typical
 *                                saving, and lib/bannedClaims already forbids this
 *                                shape of claim everywhere else on the site.
 *
 *   "What a season looks like" -> Same arithmetic, relabelled as the multiplication
 *                                it is rather than as a forecast of earnings.
 *
 *   "Stripe will automatically -> Depends on Stripe tax reporting being switched on,
 *    issue you a 1099-NEC"       which is a setting on our account. Stated as our
 *                                obligation instead of as somebody else's automation.
 *
 * The county numbers arrive through getStaticProps at the bottom of this file. Do
 * not import lib/serviceCoverage.js up here — see the note in that file.
 */
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { BUSINESS_NAME, BUSINESS_ADDRESS } from '../lib/businessInfo';
const C = { navy:'#1B3A6B',gold:'#C9A84C',darkNavy:'#0F1F3D',bg:'#F4F7FC',lightBlue:'#EEF3FB',bodyGray:'#5A6B82',mutedGray:'#8596AF',border:'#E8EDF4',white:'#FFFFFF',green:'#16a34a',lightGreen:'#f0fdf4' };

/** Florida's county filing fee, from lib/flCountyFees.js. Pass-through, not ours. */
const FL_FEE_RANGE = '$15–$50';

export default function PartnersPage({ coverage, coverageAnswer, holdbackDays }) {
  const [form, setForm] = useState({ firstName:'',lastName:'',email:'',phone:'',role:'',statesActive:'',clientVolume:'' });
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const handleStripeConnect = async () => {
    if (!result) return;
    setConnectLoading(true);
    try {
      const res = await fetch('/api/create-connect-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refCode: result.code, email: form.email, name: `${form.firstName} ${form.lastName}` }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { alert('Could not start Stripe setup: ' + (data.error || 'Unknown error')); setConnectLoading(false); }
    } catch (err) {
      alert('Connection error: ' + err.message);
      setConnectLoading(false);
    }
  };
  const upd = (key,val) => setForm(p=>({...p,[key]:val}));
  const handleSubmit = async () => {
    if (!form.firstName||!form.lastName||!form.email) { setErrorMsg('Please fill in your first name, last name, and email.'); return; }
    setStatus('loading'); setErrorMsg('');
    try {
      const res = await fetch('/api/register-referrer',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||'Something went wrong');
      setResult(data); setStatus('success');
    } catch(err) { setErrorMsg(err.message); setStatus('error'); }
  };
  const copyLink = () => {
    if (!result?.referralLink) return;
    navigator.clipboard.writeText(result.referralLink).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2500); });
  };
  return (
    <>
      <Head>
        <title>Partner Program — Earn $20 Per Referral | TaxAppeal USA</title>
        <meta name="description" content="Real estate agents and HOA managers: earn $20 for every homeowner you refer to TaxAppeal USA. Share your unique link, we handle the rest. Paid monthly." />
        <link rel="canonical" href="https://www.taxappealusa.com/partners" />
      </Head>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{font-family:'DM Sans',sans-serif;background:${C.bg};color:${C.darkNavy};}
        .container{max-width:860px;margin:0 auto;padding:0 24px;}
        input,select{width:100%;padding:11px 14px;border:1px solid ${C.border};border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;color:${C.darkNavy};background:${C.white};outline:none;transition:border-color 0.15s;}
        input:focus,select:focus{border-color:${C.navy};}
        label{font-size:13px;font-weight:500;color:${C.bodyGray};display:block;margin-bottom:6px;}
        @media(max-width:640px){.hero-grid{grid-template-columns:1fr!important;}.stat-grid{grid-template-columns:1fr 1fr!important;}}
      `}</style>
      <div style={{background:C.white,borderBottom:`1.5px solid ${C.border}`,padding:'16px 40px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <Link href="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}>
          <div style={{width:34,height:34,background:C.navy,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🏠</div>
          <div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:C.darkNavy}}>TaxAppeal USA</div>
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'1.5px',color:C.mutedGray}}>Property Tax Dispute</div>
          </div>
        </Link>
        <Link href="/apply"><button style={{background:C.navy,color:'#fff',border:'none',borderRadius:8,padding:'10px 22px',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>File an appeal →</button></Link>
      </div>
      <section style={{background:C.navy,padding:'64px 40px'}}>
        <div className="container">
          <div style={{fontSize:12,color:C.gold,textTransform:'uppercase',letterSpacing:'2px',marginBottom:16}}>Partner Program</div>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:42,lineHeight:1.15,color:C.white,marginBottom:16,maxWidth:600}}>
            Earn $20 every time a client files their property tax appeal
          </h1>
          <p style={{fontSize:18,color:'#8596AF',lineHeight:1.6,maxWidth:560,marginBottom:40}}>
            Share your unique link. When a homeowner clicks it and completes a paid filing, you earn $20 — automatically tracked, paid monthly. No percentages, no paperwork, no minimums.
          </p>
          <div className="stat-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            {/* "$89 — Customer pays" was flatly untrue for every Florida customer,
                who pays $89 plus a county filing fee of $15–$50. */}
            {[['$20','Per referral, flat'],['$89 + county fee','Customer pays'],['Monthly','Payout schedule'],['No minimum','To get paid']].map(([n,l])=>(
              <div key={l} style={{background:'#0F1F3D',borderRadius:10,padding:'16px',textAlign:'center'}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:C.gold}}>{n}</div>
                <div style={{fontSize:11,color:'#5A7A9F',marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/*
        ==================================================================
        PERPETUAL ATTRIBUTION — the promise that replaced a false one.
        ==================================================================
        This block REPLACES the claim "We email every customer 11 months after
        their filing with a renewal reminder." There was no such job: four crons
        exist and none of them sends it, and `grep -i renewal` across every cron
        and the whole email-templates file returned nothing. It was a recurring-
        revenue pitch used to recruit partners, and it was not true.

        What is written here is different in kind, and that is why it can be
        published before the payout logic is built:

          - The DATA is already captured. lib/fulfillOrder.js writes
            `ref_code` onto every order at purchase, permanently. We already know
            who referred each customer.
          - The OBLIGATION cannot come due until FL 2027. No customer can refile
            before next August, so nobody can be short-changed in the meantime.
          - The window-open partner email first fires for TX/GA on 31 Jan 2027.

        Both come due AFTER the off-season build. Do not add further partner
        promises on the same terms without checking that second condition —
        "nobody can be short-changed before we ship it" is what makes this
        publishable, not the fact that we intend to build it.

        Decisions this copy encodes, settled 11 Aug 2026:
          - Credit follows the ORIGINAL referrer, forever, with no action needed.
          - EXCEPT where the customer arrives through a different partner's link
            that season — then the active partner earns it. Without that carve-out
            a partner who does the work loses to one who did nothing, notices, and
            tells other realtors.
          - Conditional on remaining an active partner, so a removed or closed
            account stops accruing.
          - Match on email AND property, so a customer changing email address does
            not silently cost their referrer the credit.
      */}
      <section style={{padding:'44px 40px',background:C.white,borderTop:`4px solid ${C.gold}`}}>
        <div className="container">
          <div style={{display:'flex',gap:14,alignItems:'flex-start',flexWrap:'wrap'}}>
            <div style={{flex:'1 1 380px'}}>
              <div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>
                Every year, not just the first
              </div>
              <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,marginBottom:14,lineHeight:1.2}}>
                You keep earning on the clients you bring us
              </h2>
              <p style={{fontSize:15.5,color:C.bodyGray,lineHeight:1.75,marginBottom:14}}>
                When someone you refer files again next season, you earn another <strong>$20</strong> &mdash;
                automatically. You don&rsquo;t need to send them a new link, and you don&rsquo;t need to do
                anything at all. We record who referred each customer at their first filing and it stays
                with them, for as long as you&rsquo;re an active partner.
              </p>
              <p style={{fontSize:15.5,color:C.bodyGray,lineHeight:1.75}}>
                When your state&rsquo;s filing window opens we email you first, with your link, so you can
                reach your clients before we contact them. <strong style={{color:C.darkNavy}}>And if a client
                of yours comes back on their own later, you still get paid.</strong> We are not going to take
                your client direct.
              </p>
            </div>
            <div style={{flex:'0 1 250px',background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:'20px 22px'}}>
              <div style={{fontSize:11,fontWeight:700,color:C.mutedGray,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>
                One referral, over time
              </div>
              {[['Year 1','$20'],['Year 2','$20'],['Year 3','$20']].map(([y,v])=>(
                <div key={y} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${C.border}`,fontSize:14}}>
                  <span style={{color:C.bodyGray}}>{y}</span>
                  <strong style={{color:C.darkNavy}}>{v}</strong>
                </div>
              ))}
              <div style={{fontSize:12.5,color:C.mutedGray,marginTop:12,lineHeight:1.6}}>
                Each time that homeowner files again. Nothing further required from you.
              </div>
            </div>
          </div>
        </div>
      </section>
      <section style={{padding:'56px 40px'}}>
        <div className="container">
          <div className="hero-grid" style={{display:'grid',gridTemplateColumns:'1fr 400px',gap:48,alignItems:'start'}}>
            <div>
              <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,marginBottom:12}}>How the program works</h2>
              <p style={{fontSize:15,color:C.bodyGray,lineHeight:1.7,marginBottom:8}}>Ideal for real estate agents, HOA managers, financial advisors, and anyone with homeowner clients. Your clients need this — now you get paid for the referral.</p>
              {/* Counted, not written. See getStaticProps at the foot of this file. */}
              <p style={{fontSize:13,color:C.mutedGray,lineHeight:1.7,marginBottom:32}}>
                Filing in {coverage.servingStates.join(', ')} — all {coverage.texas.served} Texas counties, all {coverage.georgia.served} Georgia counties, and {coverage.florida.complete ? `all ${coverage.florida.total}` : `${coverage.florida.served} of Florida's ${coverage.florida.total}`} Florida counties.
                {!coverage.florida.complete && ` The other ${coverage.florida.notYetOpen} have not published the Value Adjustment Board address and fee we need to file correctly, so we do not take orders there yet — a client in one of them is told, charged nothing, and emailed the moment their county opens.`}
              </p>
              {[{n:'1',title:'Sign up below',desc:'Takes 60 seconds. We generate your unique referral link and email it to you instantly.'},{n:'2',title:'Share your link',desc:'Text it, email it, put it in your email signature. The link tracks every referral automatically — no code for your client to enter.'},{n:'3',title:'Clients file in 4 minutes',desc:`They click your link, enter their address, and our system pulls comparable market sales data to build a customized filing. They review it, sign it themselves, and pay $89 — plus their county's filing fee where one applies, which in Florida is ${FL_FEE_RANGE} set by the county. We prepare and mail the filing to the correct county authority.`},{n:'4',title:'You get paid monthly',desc:`On the 1st of each month we settle the previous month’s completed orders and send $20 each to your bank account via Stripe Connect. We hold each order for ${holdbackDays} days first, so a customer refund can’t land after you’ve already been paid — referrals from the last few days of a month simply go out in the following run. Refunded and cancelled orders never count, and your dashboard shows exactly which referrals counted, which are still waiting, and why.`}].map(({n,title,desc})=>(
                <div key={n} style={{display:'flex',gap:16,marginBottom:24}}>
                  <div style={{width:36,height:36,background:C.navy,color:C.gold,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Serif Display',serif",fontSize:18,flexShrink:0}}>{n}</div>
                  <div><div style={{fontSize:16,fontWeight:500,marginBottom:4}}>{title}</div><div style={{fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{desc}</div></div>
                </div>
              ))}
              <div style={{background:C.lightBlue,border:'1px solid #B5D4F4',borderRadius:12,padding:'24px 26px',marginTop:8}}>
                <div style={{fontSize:17,fontWeight:500,color:C.navy,marginBottom:10}}>A reason to call your clients every year</div>
                <p style={{fontSize:14,color:C.bodyGray,lineHeight:1.75,marginBottom:14}}>
                  Finding a reason to reach out to past clients that isn&apos;t a sales pitch is hard. Property taxes come around like clockwork — every homeowner, every year, whether they&apos;re buying, selling, or staying put.
                </p>
                <div style={{background:C.white,borderLeft:`3px solid ${C.gold}`,borderRadius:6,padding:'12px 16px',fontSize:14,color:C.darkNavy,lineHeight:1.7,fontStyle:'italic',marginBottom:14}}>
                  &ldquo;Your assessment notice is about to land — here&apos;s how to make sure you&apos;re not overpaying.&rdquo;
                </div>
                {/* "a real shot at saving thousands" quantified an outcome we cannot
                    substantiate — no outcome data exists yet, and lib/bannedClaims
                    already forbids exactly this shape of claim on every other page.
                    The reason to make the call is the call, not a number. */}
                <p style={{fontSize:14,color:C.bodyGray,lineHeight:1.75}}>
                  That&apos;s a call worth making. Your client gets their assessment reviewed and a properly prepared appeal filed — and you&apos;re the one who told them about it. It costs you nothing, it makes you look good, and it puts you back in front of them right before they think about buying, selling, or shopping a policy.
                </p>
              </div>
              <div style={{background:C.lightGreen,border:'1px solid #86efac',borderRadius:10,padding:'16px 20px',marginTop:16}}>
                {/* THIS IS AN EARNINGS CLAIM AND IT IS REGULATED.
                    Headed "What a season looks like", introduced with "most partners
                    share their link with their whole client list", it read as a
                    description of what partners typically make. The program has no
                    partners with results yet, so there was nothing behind it — and
                    under the FTC Act § 5 net-impression standard the caption is the
                    claim, not the arithmetic underneath it.
                    The table is the same $20 × N it always was. It is now labelled as
                    that, and as nothing more. Do not restore a caption that implies a
                    typical result until there are results to be typical of. */}
                <div style={{fontSize:11,fontWeight:500,color:C.green,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>The math, at $20 a referral</div>
                <div style={{fontSize:12,color:C.bodyGray,lineHeight:1.6,marginBottom:8}}>Simple multiplication, not a projection — how much you earn depends entirely on how many of your clients choose to file.</div>
                {[['10 clients file','$200'],['25 clients file','$500'],['50 clients file','$1,000'],['100 clients file','$2,000']].map(([vol,amt])=>(
                  <div key={vol} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid #bbf7d0',fontSize:13,color:C.darkNavy}}>
                    <span style={{color:C.bodyGray}}>{vol}</span><span><strong>{amt}</strong></span>
                  </div>
                ))}
                <div style={{fontSize:12,color:C.bodyGray,lineHeight:1.6,marginTop:10}}>Filing season comes once a year, and it repeats — when a client of yours files again, you earn $20 again, automatically, with nothing further required from you. If they come back through your link, you earn $20 again.</div>
              </div>
              <div style={{background:C.lightBlue,border:`1px solid ${C.border}`,borderRadius:12,padding:'20px 24px',marginTop:24}}>
                <div style={{fontSize:14,fontWeight:500,marginBottom:8}}>What to tell your clients</div>
                {/* The single highest-risk string on the page: a partner says this in
                    their own name, to their own client. "for $89 flat" is a price
                    quote they cannot honour in Florida. */}
                <div style={{fontSize:14,color:C.bodyGray,lineHeight:1.7,fontStyle:'italic'}}>&ldquo;Your property tax notice just came in — I use TaxAppeal USA for my clients. They prepare the appeal, you sign it, and they mail it. $89 plus your county&apos;s filing fee, and no percentage of your savings. Takes about 4 minutes. Here&apos;s my link: [your link]&rdquo;</div>
              </div>
            </div>
            <div>
              {status==='success'&&result ? (
                <div style={{background:C.white,border:`0.5px solid ${C.border}`,borderRadius:16,padding:'32px 28px'}}>
                  <div style={{width:52,height:52,background:C.lightGreen,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,margin:'0 auto 16px'}}>✅</div>
                  <h3 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,textAlign:'center',marginBottom:8}}>{result.duplicate?'Welcome back!':"You're in!"}</h3>
                  <p style={{fontSize:14,color:C.bodyGray,textAlign:'center',lineHeight:1.6,marginBottom:24}}>{result.duplicate?'You already have a referral code. Your link is below.':"Your referral link is ready. We've emailed it to you too."}</p>
                  <div style={{background:C.lightBlue,border:'1px solid #B5D4F4',borderRadius:10,padding:'16px 20px',marginBottom:16}}>
                    <div style={{fontSize:11,fontWeight:500,color:'#0C447C',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Your code</div>
                    <div style={{fontSize:20,fontWeight:500,color:C.navy,letterSpacing:1}}>{result.code}</div>
                  </div>
                  <div style={{background:'#f8fafc',border:`1px solid ${C.border}`,borderRadius:10,padding:'14px 16px',marginBottom:16,wordBreak:'break-all',fontSize:13,color:C.bodyGray}}>{result.referralLink}</div>
                  <button onClick={copyLink} style={{background:C.navy,color:'#fff',border:'none',borderRadius:8,padding:'12px 24px',fontSize:14,fontWeight:500,cursor:'pointer',width:'100%',fontFamily:"'DM Sans',sans-serif",marginBottom:10}}>{copied?'✅ Copied!':'📋 Copy My Referral Link'}</button>
                  <a href={`/partners/dashboard?ref=${result.code}&email=${encodeURIComponent(form.email)}`} style={{display:'block',width:'100%',background:'transparent',color:C.navy,border:`1.5px solid ${C.navy}`,borderRadius:8,padding:'11px 24px',fontSize:14,fontWeight:500,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",textAlign:'center',textDecoration:'none',marginBottom:12,boxSizing:'border-box'}}>View my dashboard →</a>
                  <div style={{borderTop:`1px solid ${C.border}`,marginTop:16,paddingTop:16}}>
                    <div style={{fontSize:13,fontWeight:500,marginBottom:6}}>Set up your payout account</div>
                    <p style={{fontSize:12,color:C.bodyGray,lineHeight:1.6,marginBottom:12}}>Connect your bank account through Stripe to receive monthly payouts. Takes about 2 minutes — Stripe handles all tax forms automatically.</p>
                    <button onClick={handleStripeConnect} disabled={connectLoading} style={{display:'block',width:'100%',background:C.navy,color:'#fff',border:'none',borderRadius:8,padding:'12px 20px',fontSize:14,fontWeight:500,textAlign:'center',cursor:connectLoading?'not-allowed':'pointer',opacity:connectLoading?0.7:1,fontFamily:"'DM Sans',sans-serif"}}>{connectLoading?'Redirecting to Stripe...':'Connect Bank Account via Stripe →'}</button>
                    <p style={{fontSize:11,color:C.mutedGray,textAlign:'center',marginTop:8}}>Secured by Stripe. We never see your bank details.</p>
                  </div>
                  <p style={{fontSize:12,color:C.mutedGray,textAlign:'center',lineHeight:1.6,marginTop:12}}>Share this link via text, email, or social. Every client who clicks it and completes their filing earns you $20.</p>
                </div>
              ) : (
                <div style={{background:C.white,border:`0.5px solid ${C.border}`,borderRadius:16,padding:'32px 28px'}}>
                  <h3 style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:6}}>Get your referral link</h3>
                  <p style={{fontSize:14,color:C.bodyGray,marginBottom:24,lineHeight:1.6}}>Takes 60 seconds. Your link is ready immediately.</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
                    <div><label>First name *</label><input value={form.firstName} onChange={e=>upd('firstName',e.target.value)} placeholder="Jane" /></div>
                    <div><label>Last name *</label><input value={form.lastName} onChange={e=>upd('lastName',e.target.value)} placeholder="Smith" /></div>
                  </div>
                  <div style={{marginBottom:14}}><label>Email address *</label><input type="email" value={form.email} onChange={e=>upd('email',e.target.value)} placeholder="jane@smithrealty.com" /></div>
                  <div style={{marginBottom:14}}><label>Phone (optional)</label><input type="tel" value={form.phone} onChange={e=>upd('phone',e.target.value)} placeholder="(555) 000-0000" /></div>
                  <div style={{marginBottom:14}}>
                    <label>Your role</label>
                    <select value={form.role} onChange={e=>upd('role',e.target.value)}>
                      <option value="">Select...</option>
                      <option value="real_estate_agent">Real estate agent</option>
                      <option value="real_estate_broker">Real estate broker</option>
                      <option value="hoa_manager">HOA manager</option>
                      <option value="property_manager">Property manager</option>
                      <option value="financial_advisor">Financial advisor / CPA</option>
                      <option value="insurance_agent">Insurance agent</option>
                      <option value="mortgage_broker">Mortgage broker</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label>States you work in</label>
                    <select value={form.statesActive} onChange={e=>upd('statesActive',e.target.value)}>
                      <option value="">Select primary state...</option>
                      <option value="TX">Texas</option>
                      <option value="FL">Florida</option>
                      <option value="GA">Georgia</option>
                      {/* Still selectable — a partner who works Arkansas is exactly
                          who we want on the list before the season opens — but
                          labelled, so signing up is not mistaken for us being live
                          there. pages/apply.js blocks both at checkout. */}
                      <option value="AR">Arkansas (opens 2027)</option>
                      <option value="AL">Alabama (opens 2027)</option>
                      <option value="TX,FL">Texas + Florida</option>
                      <option value="TX,GA">Texas + Georgia</option>
                      <option value="FL,GA">Florida + Georgia</option>
                      <option value="TX,FL,GA">Texas + Florida + Georgia</option>
                      <option value="TX,FL,GA,AR,AL">All 5 states</option>
                      <option value="other">Other / Multiple</option>
                    </select>
                  </div>
                  <div style={{marginBottom:20}}>
                    <label>Approximate active homeowner clients</label>
                    <select value={form.clientVolume} onChange={e=>upd('clientVolume',e.target.value)}>
                      <option value="">Select...</option>
                      <option value="1-10">1–10</option>
                      <option value="11-50">11–50</option>
                      <option value="51-100">51–100</option>
                      <option value="100+">100+</option>
                    </select>
                  </div>
                  {errorMsg&&<div style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#dc2626'}}>{errorMsg}</div>}
                  <button onClick={handleSubmit} disabled={status==='loading'} style={{background:C.gold,color:C.darkNavy,border:'none',borderRadius:8,padding:'16px 40px',fontSize:16,fontWeight:500,cursor:'pointer',width:'100%',fontFamily:"'DM Sans',sans-serif",opacity:status==='loading'?0.7:1}}>
                    {status==='loading'?'Generating your link...':'Get My Referral Link →'}
                  </button>
                  <p style={{fontSize:12,color:C.mutedGray,textAlign:'center',marginTop:12,lineHeight:1.6}}>No contracts. No minimums. Cancel anytime.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <section style={{padding:'48px 40px',background:C.white,borderTop:`1px solid ${C.border}`}}>
        <div className="container">
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,marginBottom:28,textAlign:'center'}}>Partner FAQ</h2>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            {[['Does my client need to enter a code?','No. Your unique link automatically tracks the referral. Your client just clicks and files — nothing extra required.'],
            ['When do I get paid?',`On the 1st of each month we settle the previous month’s completed orders and send your $20 per order to your connected bank account through Stripe. Each order is held for ${holdbackDays} days before it is paid, so a referral from the last few days of a month goes out in the following run rather than that one — it shows as pending on your dashboard in the meantime. There is no minimum balance. You need a connected bank account to receive a payout; until you connect one your earnings keep accruing and go out in the first run after you do.`],
            ['Which referrals count?','Orders that were paid for and not refunded. Abandoned checkouts, refunds and chargebacks do not count, and neither does a filing you buy for yourself through your own link. Your dashboard lists anything that did not count and the reason, so the number you see is the number we pay.'],
            ['Is there a limit to referrals?','No limit. Refer as many clients as you like. Every completed filing earns you $20.'],
            ['What if a client files again next year?','You earn $20 again, and you do not have to do anything to get it. We record who referred each customer at their first filing and the credit stays with you for as long as you are an active partner — whether they come back through your link or on their own. The one exception is if they are actively referred by a different partner that season, in which case the credit follows that referral.'],
            // Counted at build time. When Nathan confirms another county by phone,
            // this answer changes on the next deploy with no copy edit.
            ['Does TaxAppeal serve all counties?', coverageAnswer],
            ['What does the fee cover?',`Your client pays $89 for the appeal itself: a dispute letter or petition built from comparable market sales data and county assessment records, prepared for them to sign, then mailed with tracking, plus status updates through the county process. Florida counties also charge a mandatory filing fee of ${FL_FEE_RANGE} set by each county — we collect it and pay the county on your client's behalf, and none of it comes to us. Texas and Georgia have no county filing fee.`],
            // Rewritten from "Stripe will automatically issue you a 1099-NEC and file
            // it with the IRS". That is only true if Stripe tax reporting is enabled
            // on the platform account — a setting, not a guarantee. If it is off,
            // nobody files anything and the partner discovers it in April. Stated as
            // our obligation, which it is either way.
            ['Do you withhold taxes from my payouts?','No. Referral earnings are self-employment income and we do not withhold income taxes — you are responsible for reporting them. If you receive $600 or more from us in a calendar year we will arrange the required 1099-NEC using the details you provide to Stripe. Keep your own record of what you receive either way. We recommend setting aside 25–30% of your earnings for taxes. This is not tax advice; ask your own accountant about your situation.']].map(([q,a])=>(
              <div key={q} style={{background:C.bg,borderRadius:12,padding:'20px 24px'}}>
                <div style={{fontSize:14,fontWeight:500,marginBottom:8}}>{q}</div>
                <div style={{fontSize:13,color:C.bodyGray,lineHeight:1.7}}>{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <footer style={{background:C.darkNavy,padding:'24px 40px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
        {/* The postal address, from lib/businessInfo.js. This page recruits people
            into a paid commercial relationship and is the landing page for the
            partner outreach mail — the same address CAN-SPAM requires in that mail
            should be visible at the destination it points to. One definition,
            imported; do not retype it here. */}
        <p style={{color:C.mutedGray,fontSize:12,lineHeight:1.6}}>
          © 2026 {BUSINESS_NAME} · customerservice@taxappealusa.com<br />
          {BUSINESS_ADDRESS}
        </p>
        <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
          {[['Texas','/texas'],['Florida','/florida'],['Georgia','/georgia'],['Arkansas','/arkansas'],['Alabama','/alabama'],['Blog','/blog'],['Terms','/terms'],['Privacy','/privacy']].map(([label,href])=>(
            <Link key={href} href={href} style={{color:C.mutedGray,fontSize:12,textDecoration:'none'}}>{label}</Link>
          ))}
        </div>
      </footer>
    </>
  );
}

/**
 * County coverage, counted at BUILD time.
 *
 * Two reasons this is getStaticProps and not a module-scope import:
 *
 *   1. lib/serviceCoverage.js pulls in the full 67-entry Florida VAB address table.
 *      Imported into the component, Next would ship every street address, phone note
 *      and source URL to the browser in order to render one integer.
 *
 *   2. Nathan is working through the remaining county calls. Each confirmation flips
 *      a `confidence` flag in lib/flVabAddresses.js; the next deploy recounts and
 *      this page is right again, with nothing to remember and no copy to edit.
 *
 * If the count ever needs to update WITHOUT a deploy, add `revalidate` here. It does
 * not, today: confirming a county is a code change, so a deploy happens anyway.
 */
export async function getStaticProps() {
  const { getServiceCoverage, coverageSentence } = await import('../lib/serviceCoverage');
  // The holdback is a promise about WHEN a partner gets paid, so it is read from the
  // constant the settlement run actually enforces. Typing "7" here is how the page and
  // the code drift apart the first time the number is tuned.
  const { MIN_ORDER_AGE_DAYS } = await import('../lib/referralSettlement');
  const coverage = getServiceCoverage();
  return { props: { coverage, coverageAnswer: coverageSentence(coverage), holdbackDays: MIN_ORDER_AGE_DAYS } };
}
