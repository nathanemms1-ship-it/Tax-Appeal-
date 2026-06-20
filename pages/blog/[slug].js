import Head from 'next/head';
import { useRouter } from 'next/router';
import { posts, getPostBySlug, getAllSlugs } from '../../lib/blogPosts';

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

export async function getStaticPaths() {
  return {
    paths: getAllSlugs().map(slug => ({ params: { slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const post = getPostBySlug(params.slug);
  if (!post) return { notFound: true };
  return { props: { post } };
}

export default function BlogPost({ post }) {
  const router = useRouter();

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": post.title,
    "description": post.metaDescription,
    "datePublished": post.publishDate,
    "dateModified": post.publishDate,
    "author": { "@type": "Organization", "name": "TaxAppeal USA" },
    "publisher": {
      "@type": "Organization",
      "name": "TaxAppeal USA",
      "url": "https://www.taxappealusa.com",
      "logo": { "@type": "ImageObject", "url": "https://www.taxappealusa.com/favicon.ico" }
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": `https://www.taxappealusa.com/blog/${post.slug}` },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": post.faqs.map(([q, a]) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a }
    }))
  };

  return (
    <>
      <Head>
        <title>{post.metaTitle}</title>
        <meta name="description" content={post.metaDescription} />
        <link rel="canonical" href={`https://www.taxappealusa.com/blog/${post.slug}`} />
        <meta property="og:title" content={post.metaTitle} />
        <meta property="og:description" content={post.metaDescription} />
        <meta property="og:url" content={`https://www.taxappealusa.com/blog/${post.slug}`} />
        <meta property="og:type" content="article" />
        <meta property="article:published_time" content={post.publishDate} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      </Head>
      <style>{`
        ${FONT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        .btn-primary { background: ${C.navy}; color: #fff; border: none; border-radius: 8px; padding: 14px 28px; font-size: 15px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.2s; }
        .btn-primary:hover { background: ${C.gold}; color: ${C.darkNavy}; }
        .faq-item { background: ${C.white}; border: 1.5px solid ${C.border}; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
        .faq-q { padding: 16px 20px; font-size: 15px; font-weight: 500; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        .faq-q:hover { background: ${C.bg}; }
        .faq-a { padding: 0 20px 16px; font-size: 14px; color: ${C.bodyGray}; line-height: 1.7; }
        .related-link { display: block; padding: 10px 14px; background: ${C.white}; border: 1.5px solid ${C.border}; border-radius: 8px; text-decoration: none; color: ${C.navy}; font-size: 13px; font-weight: 500; margin-bottom: 8px; transition: border-color 0.2s; }
        .related-link:hover { border-color: ${C.navy}; }
        @media (max-width: 768px) {
          .layout { grid-template-columns: 1fr !important; }
          .sidebar { order: -1; }
        }
      `}</style>

      {/* Nav */}
      <div style={{ background: C.white, borderBottom: `1.5px solid ${C.border}`, padding: "16px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 34, height: 34, background: C.navy, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏠</div>
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.darkNavy }}>TaxAppeal</div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "1.5px", color: C.mutedGray }}>Property Tax Dispute</div>
          </div>
        </a>
        <button className="btn-primary" onClick={() => router.push('/apply')}>Start my dispute →</button>
      </div>

      {/* Breadcrumb */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "10px 40px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", fontSize: 12, color: C.mutedGray, display: "flex", gap: 6, alignItems: "center" }}>
          <a href="/" style={{ color: C.mutedGray, textDecoration: "none" }}>Home</a>
          <span>›</span>
          <a href="/blog" style={{ color: C.mutedGray, textDecoration: "none" }}>Blog</a>
          <span>›</span>
          <span style={{ color: C.bodyGray }}>{post.title}</span>
        </div>
      </div>

      {/* Hero */}
      <section style={{ background: C.navy, padding: "48px 40px", color: C.white }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, background: "rgba(255,201,64,0.15)", color: C.gold, borderRadius: 6, padding: "3px 10px", textTransform: "uppercase", letterSpacing: "0.8px" }}>
              {post.category}
            </span>
            <span style={{ fontSize: 12, color: "#5A7A9F" }}>{post.readTime}</span>
            <span style={{ fontSize: 12, color: "#5A7A9F" }}>
              {new Date(post.publishDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, lineHeight: 1.2, marginBottom: 16, maxWidth: 720 }}>
            {post.title}
          </h1>
          <p style={{ fontSize: 16, color: "#8596AF", lineHeight: 1.6, maxWidth: 680 }}>
            {post.metaDescription}
          </p>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: "48px 40px", background: C.bg }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="layout" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 40, alignItems: "start" }}>

            {/* Main Content */}
            <div>
              {/* Intro */}
              <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 28, marginBottom: 28, fontSize: 15, color: C.bodyGray, lineHeight: 1.8 }}>
                {post.intro}
              </div>

              {/* Sections */}
              {post.sections.map((section, i) => (
                <div key={i} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 28, marginBottom: 20 }}>
                  <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: C.darkNavy, marginBottom: 14, lineHeight: 1.3 }}>
                    {section.heading}
                  </h2>
                  {section.content && (
                    <p style={{ fontSize: 14, color: C.bodyGray, lineHeight: 1.8, marginBottom: section.list ? 16 : 0 }}>
                      {section.content}
                    </p>
                  )}
                  {section.list && (
                    <ul style={{ paddingLeft: 0, listStyle: "none" }}>
                      {section.list.map((item, j) => (
                        <li key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, fontSize: 14, color: C.bodyGray, lineHeight: 1.6 }}>
                          <span style={{ color: C.green, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {/* FAQ */}
              <div style={{ marginTop: 32 }}>
                <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.darkNavy, marginBottom: 20 }}>
                  Frequently Asked Questions
                </h2>
                {post.faqs.map(([q, a], i) => (
                  <details key={i} className="faq-item">
                    <summary className="faq-q">{q} <span style={{ color: C.mutedGray }}>▾</span></summary>
                    <div className="faq-a">{a}</div>
                  </details>
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div className="sidebar" style={{ position: "sticky", top: 24 }}>

              {/* CTA Box */}
              <div style={{ background: C.navy, borderRadius: 14, padding: 24, marginBottom: 20, color: C.white }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, marginBottom: 10, lineHeight: 1.3 }}>
                  File your protest for $79 flat
                </div>
                <p style={{ fontSize: 13, color: "#8596AF", lineHeight: 1.6, marginBottom: 18 }}>
                  We draft your letter, file via certified mail, and you keep 100% of your savings. Takes 4 minutes.
                </p>
                <div style={{ marginBottom: 16 }}>
                  {["No contingency fees", "Certified mail with tracking", "82% approval rate", "All counties covered"].map(f => (
                    <div key={f} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: C.gold, marginBottom: 6 }}>
                      <span>✓</span> {f}
                    </div>
                  ))}
                </div>
                <button
                  className="btn-primary"
                  style={{ background: C.gold, color: C.darkNavy, width: "100%", fontSize: 14, padding: "13px 0" }}
                  onClick={() => window.location.href = '/apply'}
                >
                  Start My Dispute — $79 →
                </button>
              </div>

              {/* Related Links */}
              <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, fontWeight: 600, marginBottom: 14 }}>
                  Related Guides
                </div>
                {post.relatedLinks.map(link => (
                  <a key={link.href} href={link.href} className="related-link">
                    {link.text} →
                  </a>
                ))}
                {post.stateSlug && (
                  <a href={post.stateSlug} className="related-link" style={{ marginTop: 8 }}>
                    View full state guide →
                  </a>
                )}
              </div>

              {/* Trust signals */}
              <div style={{ background: C.lightBlue, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginTop: 20 }}>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1px", color: C.mutedGray, fontWeight: 600, marginBottom: 14 }}>
                  Why TaxAppeal
                </div>
                {[["82%", "protest success rate"], ["$1,840", "average savings"], ["$79", "flat fee, no % cut"], ["254", "TX counties covered"]].map(([n, l]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, color: C.bodyGray }}>{l}</span>
                    <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.navy, fontWeight: 700 }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ background: C.navy, padding: "56px 40px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: C.white, marginBottom: 12 }}>
          Ready to protest your property taxes?
        </h2>
        <p style={{ fontSize: 15, color: "#8596AF", marginBottom: 24 }}>
          $79 flat fee. We handle everything. You keep 100% of your savings.
        </p>
        <button
          className="btn-primary"
          style={{ background: C.gold, color: C.darkNavy, fontSize: 16, padding: "16px 44px" }}
          onClick={() => router.push('/apply')}
        >
          Start My Dispute — $79 →
        </button>
      </section>

      {/* Footer */}
      <footer style={{ background: C.darkNavy, padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ color: C.mutedGray, fontSize: 12 }}>© 2026 TaxAppeal USA · disputes@taxappealusa.com</p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <a href="/texas" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Texas</a>
          <a href="/georgia" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Georgia</a>
          <a href="/florida" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Florida</a>
          <a href="/blog" style={{ color: C.gold, fontSize: 12, textDecoration: "none" }}>Blog</a>
          <a href="/terms" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Terms</a>
          <a href="/privacy" style={{ color: C.mutedGray, fontSize: 12, textDecoration: "none" }}>Privacy</a>
        </div>
      </footer>
    </>
  );
}
