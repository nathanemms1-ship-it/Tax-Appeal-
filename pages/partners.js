// pages/partners.js
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';

const C = { navy:'#1B3A6B',gold:'#C9A84C',darkNavy:'#0F1F3D',bg:'#F4F7FC',lightBlue:'#EEF3FB',bodyGray:'#5A6B82',mutedGray:'#8596AF',border:'#E8EDF4',white:'#FFFFFF',green:'#16a34a',lightGreen:'#f0fdf4' };

export default function PartnersPage() {
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
        body: JSON.stringify({ referralCode: result.code, email: form.email, name: `${form.firstName} ${form.lastName}` }),
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
        <title>Partner Program — Earn $15 Per Referral | TaxAppeal USA</title>
        <meta name="description" content="Real estate agents and HOA managers: earn $15 for every homeowner you refer to TaxAppeal USA. Share your unique link, we handle the rest. Paid monthly." />
        <link rel="canonical" href="https://www.taxappealusa.com/partners" />
      </Head>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');
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
            Earn $15 every time a client files their property tax appeal
          </h1>
          <p style={{fontSize:18,color:'#8596AF',lineHeight:1.6,maxWidth:560,marginBottom:40}}>
            Share your unique link. When a homeowner clicks it and completes their $79 filing, you earn $15 — automatically tracked, paid monthly. No percentages, no paperwork, no minimums.
          </p>
          <div className="stat-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            {[['$15','Per referral, flat'],['$79','Customer pays'],['Monthly','Payout schedule'],['No minimum','To get paid']].map(([n,l])=>(
              <div key={l} style={{background:'#0F1F3D',borderRadius:10,padding:'16px',textAlign:'center'}}>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:C.gold}}>{n}</div>
                <div style={{fontSize:11,color:'#5A7A9F',marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{padding:'56px 40px'}}>
        <div className="container">
          <div className="hero-grid" style={{display:'grid',gridTemplateColumns:'1fr 400px',gap:48,alignItems:'start'}}>

            <div>
              <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:30,marginBottom:12}}>How the program works</h2>
              <p style={{fontSize:15,color:C.bodyGray,lineHeight:1.7,marginBottom:32}}>Ideal for real estate agents, HOA managers, financial advisors, and anyone with homeowner clients. Your clients need this — now you get paid for the referral.</p>
              {[{n:'1',title:'Sign up below',desc:'Takes 60 seconds. We generate your unique referral link and email it to you instantly.'},{n:'2',title:'Share your link',desc:'Text it, email it, put it in your email signature. The link tracks every referral automatically — no code for your client to enter.'},{n:'3',title:'Clients file in 4 minutes',desc:'They click your link, enter their address, and our system pulls comparable market sales data to build a customized dispute letter. They review it, pay $79, and we handle certified mail filing directly to the county appraisal district.'},{n:'4',title:'You get paid monthly',desc:'At the end of each month we tally your referrals and pay you $15 per completed order directly to your bank account via Stripe Connect — automated, no manual transfers needed.'}].map(({n,title,desc})=>(
                <div key={n} style={{display:'flex',gap:16,marginBottom:24}}>
                  <div style={{width:36,height:36,background:C.navy,color:C.gold,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Serif Display',serif",fontSize:18,flexShrink:0}}>{n}</div>
                  <div><div style={{fontSize:16,fontWeight:500,marginBottom:4}}>{title}</div><div style={{fontSize:14,color:C.bodyGray,lineHeight:1.7}}>{desc}</div></div>
                </div>
              ))}
              <div style={{background:C.lightGreen,border:'1px solid #86efac',borderRadius:12,padding:'20px 24px',marginTop:8}}>
                <div style={{fontSize:14,fontWeight:500,color:C.green,marginBottom:8}}>Example earnings</div>
                {[['5 clients/month','$75/mo','$900/yr'],['10 clients/month','$150/mo','$1,800/yr'],['20 clients/month','$300/mo','$3,600/yr']].map(([vol,mo,yr])=>(
                  <div key={vol} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #bbf7d0',fontSize:14,color:C.darkNavy}}>
                    <span style={{color:C.bodyGray}}>{vol}</span><span><strong>{mo}</strong> · {yr}</span>
                  </div>
                ))}
              </div>
              <div style={{background:C.lightBlue,border:`1px solid ${C.border}`,borderRadius:12,padding:'20px 24px',marginTop:24}}>
                <div style={{fontSize:14,fontWeight:500,marginBottom:8}}>What to tell your clients</div>
                <div style={{fontSize:14,color:C.bodyGray,lineHeight:1.7,fontStyle:'italic'}}>&ldquo;Your property tax notice just came in — I use TaxAppeal USA for my clients. They file your protest via certified mail for $79 flat, no percentage of your savings. Takes about 4 minutes. Here&apos;s my link: [your link]&rdquo;</div>
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
                  <button onClick={copyLink} style={{background:C.navy,color:'#fff',border:'none',borderRadius:8,padding:'12px 24px',fontSize:14,fontWeight:500,cursor:'pointer',width:'100%',fontFamily:"'DM Sans',sans-serif",marginBottom:12}}>{copied?'✅ Copied!':'📋 Copy My Referral Link'}</button>
                  <div style={{borderTop:`1px solid ${C.border}`,marginTop:16,paddingTop:16}}>
                    <div style={{fontSize:13,fontWeight:500,marginBottom:6}}>Set up your payout account</div>
                    <p style={{fontSize:12,color:C.bodyGray,lineHeight:1.6,marginBottom:12}}>Connect your bank account through Stripe to receive monthly payouts. Takes about 2 minutes — Stripe handles all tax forms automatically.</p>
                    <button onClick={handleStripeConnect} disabled={connectLoading} style={{display:'block',width:'100%',background:C.navy,color:'#fff',border:'none',borderRadius:8,padding:'12px 20px',fontSize:14,fontWeight:500,textAlign:'center',cursor:connectLoading?'not-allowed':'pointer',opacity:connectLoading?0.7:1,fontFamily:"'DM Sans',sans-serif"}}>{connectLoading?'Redirecting to Stripe...':'Connect Bank Account via Stripe →'}</button>
                    <p style={{fontSize:11,color:C.mutedGray,textAlign:'center',marginTop:8}}>Secured by Stripe. We never see your bank details.</p>
                  </div>
                  <p style={{fontSize:12,color:C.mutedGray,textAlign:'center',lineHeight:1.6,marginTop:12}}>Share this link via text, email, or social. Every client who clicks it and completes their filing earns you $15.</p>
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
                      <option value="TX,FL">Texas + Florida</option>
                      <option value="TX,GA">Texas + Georgia</option>
                      <option value="FL,GA">Florida + Georgia</option>
                      <option value="TX,FL,GA">Texas + Florida + Georgia</option>
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
            {[['Does my client need to enter a code?','No. Your unique link automatically tracks the referral. Your client just clicks and files — nothing extra required.'],['When do I get paid?','At the end of each month we pay via your connected bank account via Stripe — fully automated, no manual transfers. There is no minimum balance required. We do not withhold income taxes from your payouts.'],['Is there a limit to referrals?','No limit. Refer as many clients as you like. Every completed filing earns you $15.'],['What if a client files again next year?','We email every customer 11 months after their filing with a renewal reminder. If they refile through your link, you earn $15 again.'],['Does TaxAppeal serve all counties?','Yes — all 254 Texas counties, all 67 Florida counties, and all 159 Georgia counties.'],['What does the $79 fee cover?','AI-generated dispute letter built with comparable market sales data and county assessment records, USPS Certified Mail filing with Return Receipt, and full tracking through the appraisal district process — everything needed to make a compelling case for a reduction.'],
            ['Do you withhold taxes from my payouts?','No. Referral earnings are self-employment income and we do not withhold income taxes. You are responsible for reporting earnings on your tax return. If you earn $600 or more in a calendar year, Stripe will automatically issue you a 1099-NEC and file it with the IRS. We recommend setting aside 25–30% of your earnings for taxes.']].map(([q,a])=>(
              <div key={q} style={{background:C.bg,borderRadius:12,padding:'20px 24px'}}>
                <div style={{fontSize:14,fontWeight:500,marginBottom:8}}>{q}</div>
                <div style={{fontSize:13,color:C.bodyGray,lineHeight:1.7}}>{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{background:C.darkNavy,padding:'24px 40px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}>
        <p style={{color:C.mutedGray,fontSize:12}}>© 2026 TaxAppeal USA · customerservice@taxappealusa.com</p>
        <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
          {[['Texas','/texas'],['Florida','/florida'],['Georgia','/georgia'],['Blog','/blog'],['Terms','/terms'],['Privacy','/privacy']].map(([label,href])=>(
            <Link key={href} href={href} style={{color:C.mutedGray,fontSize:12,textDecoration:'none'}}>{label}</Link>
          ))}
        </div>
      </footer>
    </>
  );
}
