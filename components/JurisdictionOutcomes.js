import { OUTCOME_DISCLAIMER } from '../lib/stats';

/**
 * JurisdictionOutcomes — replaces the fabricated testimonial grids.
 *
 * Every state landing page used to carry a "<State> Homeowners Who Saved" section
 * headed "Real results from <State> homeowners who filed with TaxAppeal", with three
 * invented customers, five-star ratings, and "Saved $2,100" badges. TaxAppeal USA has
 * never filed a petition for anyone. See lib/stats.js for the statutory exposure that
 * created (16 C.F.R. Part 465; FTC Act § 5; Fla. Stat. § 501.204).
 *
 * This component takes the same visual slot and fills it with facts that are true and
 * checkable. Each card MUST carry a source link — the `source` and `url` props are
 * required and the component renders nothing for a card missing either, so a future
 * edit cannot quietly drop the attribution and leave a bare number on the page.
 *
 * Do not add a card here whose number you cannot open the source document and find.
 */

const C = {
  navy: '#1B3A6B', darkNavy: '#0F1F3D', bodyGray: '#5A6B82',
  mutedGray: '#8596AF', border: '#E8EDF4', white: '#FFFFFF',
};

export default function JurisdictionOutcomes({ heading, intro, cards = [], footnote }) {
  const valid = cards.filter((c) => c && c.stat && c.source && c.url);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, textAlign: 'center', marginBottom: 12 }}>
        {heading}
      </h2>
      <p style={{ fontSize: 15, color: C.bodyGray, textAlign: 'center', marginBottom: 36, lineHeight: 1.65 }}>
        {intro}
      </p>

      <div className="testimonials-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {valid.map((c, i) => (
          <div key={i} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, color: C.navy, lineHeight: 1, marginBottom: 8 }}>
              {c.stat}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.darkNavy, lineHeight: 1.45, marginBottom: 12 }}>
              {c.head}
            </div>
            <p style={{ fontSize: 13.5, color: C.bodyGray, lineHeight: 1.7, marginBottom: 16 }}>
              {c.body}
            </p>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, fontSize: 10.5, color: C.mutedGray, lineHeight: 1.5 }}>
              Source:{' '}
              <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: C.bodyGray, textDecoration: 'underline' }}>
                {c.source}
              </a>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: C.mutedGray, lineHeight: 1.65, marginTop: 24, textAlign: 'center' }}>
        {OUTCOME_DISCLAIMER}{footnote ? ` ${footnote}` : ''}
      </p>
    </div>
  );
}
