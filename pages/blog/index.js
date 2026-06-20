import Head from 'next/head';
import { useRouter } from 'next/router';
import { posts } from '../../lib/blogPosts';

const C = {
  navy: "#1B3A6B", gold: "#FFC940", darkNavy: "#0F1F3D", bg: "#F4F7FC",
  lightBlue: "#EEF3FB", bodyGray: "#5A6B82", mutedGray: "#8596AF",
  border: "#E8EDF4", white: "#FFFFFF", green: "#2E7D52",
};

const FONT = `@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');`;

const categoryColors = {
  Texas: { bg: "#EEF3FB", text: "#1B3A6B" },
  Georgia: { bg: "#FFF8E1", text: "#8B6914" },
  Florida: { bg: "#E8F5E9", text: "#2E7D52" },
  Education: { bg: "#F3E5F5", text: "#6A1B9A" },
};

export default function BlogIndex() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Property Tax Protest Guides & Resources | TaxAppeal Blog</title>
        <meta name="description" content="Expert guides on protesting property taxes in Texas, Georgia, and Florida. County-specific guides, deadline information, and tips to lower your property tax bill." />
        <link rel="canonical" href="https://www.taxappealusa.com/blog" />
        <meta property="og:title" content="Property Tax Protest Guides | TaxAppeal Blog" />
        <meta property="og:description" content="Expert guides on protesting property taxes in Texas, Georgia, and Florida. Save money on your property tax bill." />
        <meta property="og:url" content="https://www.taxappealusa.com/blog" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          "name": "TaxAppeal Property Tax Guides",
          "url": "https://www.taxappealusa.com/blog",
          "description": "Expert guides on protesting property taxes in Texas, Georgia, and Florida.",
          "publisher": { "@type": "Organization", "name": "TaxAppeal USA", "url": "https://www.taxappealusa.com" },
        })}} />
      </Head>
      <style>{`
        ${FONT}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: ${C.bg}; color: ${C.darkNavy}; }
        .btn-primary { background: ${C.navy}; color: #fff; border: none; border-radius: 8px; padding: 14px 28px; font-size: 15px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.2s; }
        .btn-primary:hover { background: ${C.gold}; color: ${C.darkNavy}; }
        .post-card { background: ${C.white}; border: 1.5px solid ${C.border}; border-radius: 14px; padding: 28px; text-decoration: none; color: inherit; display: block; transition: box-shadow 0.2s, border-color 0.2s; }
        .post-card:hover { box-shadow: 0 6px 24px rgba(27,58,107,0.10); border-color: ${C.navy}; }
        @media (max-width: 768px) {
          .posts-grid { grid-template-columns: 1fr !important; }
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

      {/* Hero */}
      <section style={{ background: C.navy, padding: "56px 40px", color: C.white }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: C.gold, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 12 }}>Resource Library</div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, lineHeight: 1.15, marginBottom: 14 }}>
            Property Tax Protest Guides
          </h1>
          <p style={{ fontSize: 17, color: "#8596AF", lineHeight: 1.6, maxWidth: 580 }}>
            County-by-county guides, deadline information, and expert tips for protesting your property taxes in Texas, Georgia, and Florida.
          </p>
        </div>
      </section>

      {/* Posts Grid */}
      <section style={{ padding: "56px 40px", background: C.bg }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="posts-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {posts.map(post => {
              const cat = categoryColors[post.category] || categoryColors.Education;
              return (
                <a key={post.slug} href={`/blog/${post.slug}`} className="post-card">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, background: cat.bg, color: cat.text, borderRadius: 6, padding: "3px 10px", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                      {post.category}
                    </span>
                    <span style={{ fontSize: 12, color: C.mutedGray }}>{post.readTime}</span>
                  </div>
                  <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, lineHeight: 1.3, marginBottom: 10, color: C.darkNavy }}>
                    {post.title}
                  </h2>
                  <p style={{ fontSize: 13, color: C.bodyGray, lineHeight: 1.6, marginBottom: 16 }}>
                    {post.intro.slice(0, 160)}…
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.mutedGray }}>{new Date(post.publishDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    <span style={{ fontSize: 13, color: C.navy, fontWeight: 500 }}>Read guide →</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: C.navy, padding: "56px 40px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: C.white, marginBottom: 12 }}>Ready to file your protest?</h2>
        <p style={{ fontSize: 15, color: "#8596AF", marginBottom: 24 }}>$79 flat fee. We handle everything. You keep 100% of your savings.</p>
        <button className="btn-primary" style={{ background: C.gold, color: C.darkNavy, fontSize: 16, padding: "16px 40px" }} onClick={() => router.push('/apply')}>
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
