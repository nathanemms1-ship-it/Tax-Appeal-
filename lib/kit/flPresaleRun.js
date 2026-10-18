/**
 * lib/kit/flPresaleRun.js — the real dependencies for finishing a Florida
 * reservation (lib/kit/flPresale.js processFlPresale), shared by the daily
 * cron (pages/api/cron/notice-reminder.js) and the deadline page's route
 * (pages/api/kit/trim.js), so the two cannot drift.
 */
import { findComps } from '../dor/comps';
import { millageForCounty } from '../dor/millage';
import { LOADED_COUNTIES } from '../dor/coverage';
import { totalCostToCure } from '../costToCure';
import { presaleDeps } from './presaleDeps';

/** Is this county's roll for `year` loaded? Memoised per run. */
export function rollChecker(supabase) {
  const seen = new Map();
  return async (coNo, year) => {
    const key = `${coNo}:${year}`;
    if (!seen.has(key)) {
      const { data, error } = await supabase.from('parcels').select('parcel_id').eq('co_no', Number(coNo)).eq('asmnt_yr', Number(year)).limit(1);
      if (error) throw new Error(error.message);
      seen.set(key, Array.isArray(data) && data.length > 0);
    }
    return seen.get(key);
  };
}

export function flPresaleRunDeps(row, { supabase, alertOps, rollLoaded = rollChecker(supabase) }) {
  return {
    rollLoaded,
    loadParcel: async (coNo, parcelId, year) => {
      const { data, error } = await supabase.from('parcels').select('*').eq('co_no', Number(coNo)).eq('parcel_id', String(parcelId)).eq('asmnt_yr', Number(year)).limit(2);
      if (error) throw new Error(error.message);
      // Two rows for one parcel id is a data problem, not a parcel: a person looks.
      return Array.isArray(data) && data.length === 1 ? data[0] : null;
    },
    caseDeps: { findComps, millageForCounty, totalCostToCure, countyName: (coNo) => LOADED_COUNTIES[Number(coNo)] || null },
    ...presaleDeps(row, { supabase, alertOps }),
  };
}
