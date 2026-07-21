// components/DisclaimerFooter.js
// Low-visibility, site-wide disclaimer. Drop <DisclaimerFooter /> at the very
// bottom of your footer/layout, below the nav links and copyright line.

export default function DisclaimerFooter() {
  return (
    <p
      style={{
        maxWidth: 900,
        margin: "24px auto 0",
        padding: "0 20px",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 10.5,
        lineHeight: 1.6,
        color: "#8596AF",
        textAlign: "center",
      }}
    >
      TaxAppeal USA is a self-service document-preparation and certified-mail filing service. Outside
      Florida, we are not property tax consultants, agents, or representatives, do not provide tax or
      legal advice, and do not represent customers before any appraisal district, board of equalization,
      or review board &mdash; all protests are filed in the property owner&rsquo;s name and signed by
      the owner. In Florida, Florida Statute &sect; 194.011(3)(h) permits TaxAppeal USA to act as the
      property owner&rsquo;s authorized, compensated representative solely to file the VAB petition,
      submit evidence, and pay the county&rsquo;s filing fee, as disclosed and separately authorized on
      Form DR-486A.
    </p>
  );
}
