/**
 * BREADCRUMB TRAILS — ONE DEFINITION, USED BY THE MARKUP AND THE MARKUP-LESS ALIKE.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * As of 10 Aug 2026 the site had ZERO instances of BreadcrumbList structured data
 * anywhere — while /texas/[city] and /blog/[slug] both rendered a visible breadcrumb
 * trail with nothing behind it. A trail a human can see and a crawler cannot is the
 * worst of both: the layout cost is paid and the search benefit is not collected.
 *
 * That matters more than it used to. Google removed the FAQ rich result on 7 May 2026
 * and the HowTo rich result on 14 Sept 2023, which between them were the only other
 * structured-data types these pages shipped. Breadcrumb is now the one type on a
 * TaxAppeal county or city page that still produces anything in a search result.
 *
 * ============================================================================
 * THE TRAIL DOES NOT HAVE TO MIRROR THE URL
 * ============================================================================
 * County pages live at a flat /counties/{slug} with no state segment, which was
 * examined and deliberately kept (migrating 573 URLs buys hierarchy and nothing else —
 * see claude/County_Page_Architecture_Audit_2026-08-10.md §5). Google's guidance is
 * that BreadcrumbList describes the position of the page within the site, not the path
 * string, so `Home → Florida → Miami-Dade County` is honest markup for
 * /counties/miami-dade-county-fl. Keep it that way: the trail should read the way a
 * person would describe where they are.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *   const trail = [
 *     { name: 'Home', href: '/' },
 *     { name: 'Florida', href: '/florida' },
 *     { name: 'Miami-Dade County' },        // last crumb: no href, it IS this page
 *   ];
 *   <script type="application/ld+json"
 *     dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema(trail, canonicalUrl)) }} />
 *
 * Render the same `trail` array visually. Passing one array to both is the point —
 * it is what stops the visible trail and the markup drifting apart.
 */

export const SITE_ORIGIN = 'https://www.taxappealusa.com';

const absolute = (href) => {
  if (!href) return null;
  return href.startsWith('http') ? href : `${SITE_ORIGIN}${href}`;
};

/**
 * @param {Array<{name: string, href?: string}>} trail  ordered, root first
 * @param {string} [selfUrl]  absolute URL of the current page, used for the last crumb
 *                            when it has no href of its own
 */
export function breadcrumbSchema(trail, selfUrl) {
  const items = trail.filter((c) => c && c.name);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((crumb, i) => {
      const isLast = i === items.length - 1;
      const item = absolute(crumb.href) || (isLast ? selfUrl : null);
      return {
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.name,
        // Google accepts a ListItem without `item` for the final crumb, but supplying
        // the canonical URL is unambiguous and costs nothing.
        ...(item ? { item } : {}),
      };
    }),
  };
}

export default breadcrumbSchema;
