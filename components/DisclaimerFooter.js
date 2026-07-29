// components/DisclaimerFooter.js
// Low-visibility, site-wide disclaimer. Rendered from pages/_app.js at the very
// bottom of every page, below the nav links and copyright line.
//
// ---------------------------------------------------------------------------
// WHY THE STRUCTURE IS "UNIVERSAL FIRST, THEN FLORIDA MECHANICS"
// ---------------------------------------------------------------------------
// This text previously opened:
//
//   "Outside Florida, we are not property tax consultants, agents, or
//    representatives, do not provide tax or legal advice, and do not represent
//    customers before any appraisal district, board of equalization, or review
//    board ... In Florida, TaxAppeal USA prepares and files the property owner's
//    VAB petition ... is not the owner's representative in those proceedings and
//    does not appear before the Board."
//
// Scoping those disclaimers to "Outside Florida" implied the converse inside it:
// that in Florida we ARE property tax consultants and agents, and that we DO
// provide tax and legal advice. The Florida sentence disclaimed only
// representation and appearing before the Board; it never disclaimed being a
// consultant or an agent, and never disclaimed giving advice. Florida is the one
// state where those disclaimers matter most, because it is the only state we
// serve with a licensing rule attached to representation (Fla. Admin. Code
// R. 12D-9.018(3)) and an open unauthorized-practice-of-law question around
// preparing a valuation argument for compensation. It was also the only state the
// sentence carved them out of.
//
// So: the disclaimers are stated once, for every state including Florida. Only
// the Florida-specific MECHANICS - who we pay, where we mail, which statute the
// owner signs under - are called out separately. Do not reintroduce a
// jurisdictional qualifier in front of "we are not ... consultants, agents, or
// representatives" or in front of "do not provide tax or legal advice." Those two
// are unconditional.

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
      TaxAppeal USA is a self-service document-preparation and mail filing service. In every state we
      serve, including Florida, we are not property tax consultants, agents, or representatives, we do
      not provide tax or legal advice, and we do not represent customers before any appraisal district,
      board of equalization, value adjustment board, or review board. Every protest and petition is
      prepared for the property owner, signed by the owner, and filed in the owner&rsquo;s name.
      {" "}In Florida we also pay your county&rsquo;s Value Adjustment Board filing fee on your behalf
      and mail your petition to the Clerk of the Value Adjustment Board. Your petition is signed by you
      as the property owner under section 194.011(3), Florida Statutes. TaxAppeal USA does not sign as
      your representative, does not appear before the Board, and does not present evidence or argument
      at a hearing.
    </p>
  );
}
