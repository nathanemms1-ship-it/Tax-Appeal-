import Head from 'next/head';
import { breadcrumbSchema, SITE_ORIGIN } from '../lib/breadcrumbs';

/**
 * BREADCRUMB — the visible trail and the markup, from one array, in one component.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * lib/breadcrumbs.js was added on 10 Aug 2026 and wired into eight pages. All eight
 * were Florida. As of 22 Aug 2026:
 *
 *   - /texas/[city] rendered a VISIBLE breadcrumb trail with no markup behind it
 *   - /texas, /houston, /dallas, /fort-worth, /austin, /san-antonio, /el-paso and
 *     /blog/[slug] rendered neither
 *
 * That is not a cosmetic gap. Google removed the FAQ rich result on 7 May 2026 and
 * the HowTo rich result on 14 Sept 2023. On a TaxAppeal city or county page,
 * BreadcrumbList is now the ONLY structured-data type that still produces anything
 * in a search result — and Texas had it on zero pages while Florida had it on eight.
 *
 * ============================================================================
 * WHY A COMPONENT RATHER THAN A COPIED BLOCK
 * ============================================================================
 * The failure mode this file is built against is drift: a visible trail that says one
 * thing and markup that says another, which is worse than having neither because
 * Google treats mismatched breadcrumb markup as a reason to distrust the page's
 * structured data generally. Passing one `trail` array to both renderers makes the
 * two incapable of disagreeing.
 *
 * next/head hoists the <Head> below into the document head from wherever this renders,
 * so a page needs one import and one element rather than an import, a schema object,
 * a <script> in its own <Head>, and a block of markup further down.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *   <Breadcrumb trail={[
 *     { name: 'Home', href: '/' },
 *     { name: 'Texas', href: '/texas' },
 *     { name: 'Harris County', href: '/counties/harris-county-tx' },
 *     { name: 'Katy' },                 // last crumb: no href, it IS this page
 *   ]} selfUrl="https://www.taxappealusa.com/texas/katy-tx" />
 *
 * The trail describes the page's position in the SITE, not the URL path — Google's
 * guidance is explicit about this, which is why a county page at the flat
 * /counties/{slug} can honestly render Home → Texas → Harris County.
 */

const C = {
  darkNavy: '#0F1F3D',
  mutedGray: '#8596AF',
  border: '#E8EDF4',
  white: '#FFFFFF',
};

export default function Breadcrumb({ trail, selfUrl, background = C.white }) {
  const crumbs = (trail || []).filter((c) => c && c.name);
  if (crumbs.length < 2) return null;

  return (
    <>
      <Head>
        <script
          type="application/ld+json"
          key="breadcrumb-ld"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbSchema(crumbs, selfUrl)),
          }}
        />
      </Head>

      <nav
        aria-label="Breadcrumb"
        style={{
          background,
          borderBottom: `1px solid ${C.border}`,
          padding: '10px 40px',
        }}
      >
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <p style={{ fontSize: 13, color: C.mutedGray, margin: 0 }}>
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.name}-${i}`}>
                {i > 0 && <span aria-hidden="true">{' → '}</span>}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    style={{ color: C.mutedGray, textDecoration: 'none' }}
                  >
                    {crumb.name}
                  </a>
                ) : (
                  <span style={{ color: C.darkNavy }} aria-current="page">
                    {crumb.name}
                  </span>
                )}
              </span>
            ))}
          </p>
        </div>
      </nav>
    </>
  );
}

export { SITE_ORIGIN };
