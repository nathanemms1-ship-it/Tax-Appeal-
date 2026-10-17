/** A Florida kit order for tests and proofs (scripts/verify-fl-kit.mjs). Invented owner; Hillsborough figures shaped like the roll. */
export const FL_NOW = new Date('2027-08-16T15:00:00Z');
export function flParcelRow(over = {}) {
  return {
    parcel_id: 'A1234567890', co_no: 39, asmnt_yr: 2027, jv: 412000, av_sd: 412000, av_nsd: 412000, tv_sd: 412000, tv_nsd: 412000,
    lnd_val: 90000, tot_lvg_area: 2100, act_yr_blt: 1998, dor_uc: 1, phy_addr1: '1234 SAMPLE OAK DR', phy_city: 'TAMPA', phy_zipcd: '33614',
    own_name: 'RIVERA JORDAN', exmpt_01: 0, ...over,
  };
}
export function flComps(over = {}) {
  return {
    sufficient: true, supportsReduction: true, reason: null, indicatedValue: 357000, medianPricePerSqft: 170, sizeBandPct: 10, ageBandYears: 15,
    level: 'neighborhood', attribution: 'Qualified arms-length sales from the 2027 Florida Department of Revenue sale data file, county 39, same appraiser neighborhood as the subject.',
    subjectSale: null,
    list: [
      { address: '1201 SAMPLE OAK DR, TAMPA', saleDate: '2026-11-03', salePrice: 352000, sqft: 2050, yearBuilt: 1997, pricePerSqft: 172 },
      { address: '1310 SAMPLE OAK DR, TAMPA', saleDate: '2026-09-21', salePrice: 371000, sqft: 2190, yearBuilt: 2001, pricePerSqft: 169 },
      { address: '880 WILLOW BEND CT, TAMPA', saleDate: '2026-12-14', salePrice: 345000, sqft: 2020, yearBuilt: 1995, pricePerSqft: 171 },
      { address: '902 WILLOW BEND CT, TAMPA', saleDate: '2027-01-30', salePrice: 362000, sqft: 2160, yearBuilt: 1999, pricePerSqft: 168 },
    ],
    ...over,
  };
}
export function flOrder(over = {}) {
  const row = flParcelRow(over.parcel || {});
  const { parcel, ...rest } = over;
  return {
    state: 'FL', taxYear: 2027,
    property: { address: '1234 SAMPLE OAK DR, TAMPA, FL 33614', county: 'Hillsborough', parcelId: 'A1234567890', coNo: 39, source: '2027 Florida DOR assessment roll, county 39' },
    owner: { name: 'Jordan Rivera', street: '1234 Sample Oak Dr', street2: '', city: 'Tampa', state: 'FL', zip: '33614', phone: '813-555-0100', email: 'jordan@example.com' },
    parcel: row, comps: flComps(), cure: { total: 0, items: [] },
    millage: { school: 5.4, nonSchool: 13.1 },
    requestedValue: 357000, savings: { yearlySaving: 1017 },
    trimDeadline: '2027-09-07', willNotAttend: false,
    ...rest,
  };
}
