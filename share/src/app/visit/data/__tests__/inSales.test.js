import { describe, expect, it } from 'vitest';
import { inSales } from '../liveSource';

/* The roster narrowing, which has one dangerous failure mode: dropping field
   staff. 27 of the 496 active employees are Business Executives or Area
   Business Managers with NO role profile set, and filtering on the profile
   alone deletes them from the tree while their visits keep counting in the
   HQ totals above it -- a tree that no longer adds up to its own cards.

   Numbers below are from the live roster on 2026-09-22. */

// A small stand-in for the 397 profiles under the Sales node.
const SALES = new Set(['Sales', 'RBM-ELBR-KE-THR', 'ABM3-ELBR-KE-THR', 'BE9-ELBR-KE-THR']);

const member = (over = {}) => ({
  id: 'E1', name: 'Someone', short: 'BE', roleProfile: null, ...over,
});

describe('inSales', () => {
  it('keeps somebody whose role profile is under Sales', () => {
    expect(inSales(member({ roleProfile: 'BE9-ELBR-KE-THR' }), SALES)).toBe(true);
  });

  it('drops somebody whose role profile is outside Sales', () => {
    // CRM, Accounts, HR, Distribution -- 89 people on the live roster.
    expect(inSales(member({ roleProfile: 'Accounts', short: 'Accountant' }), SALES)).toBe(false);
  });

  it('keeps a BE whose role profile was never set', () => {
    // 16 live BEs are in this state. Dropping them is the bug this guards.
    expect(inSales(member({ roleProfile: null, short: 'BE' }), SALES)).toBe(true);
  });

  it('keeps an ABM whose role profile was never set', () => {
    // 11 live ABMs are in this state.
    expect(inSales(member({ roleProfile: null, short: 'ABM' }), SALES)).toBe(true);
  });

  it('keeps every rung of the sales ladder when the profile is unset', () => {
    for (const short of ['BE', 'ABM', 'RBM', 'SM', 'ZSM', 'GM']) {
      expect(inSales(member({ short }), SALES)).toBe(true);
    }
  });

  it('drops a non-sales designation when the profile is unset', () => {
    // Drivers, Packing, Housekeeping -- real rows on the live roster.
    for (const short of ['Driver', 'Packing', 'Housekeeping Staff', 'Accountant']) {
      expect(inSales(member({ short }), SALES)).toBe(false);
    }
  });

  it('admits a sales profile even when the designation is not on the ladder', () => {
    // 3 Key Account Managers and 1 BDM are under Sales on the live roster.
    expect(inSales(member({ short: 'Key Account Manager', roleProfile: 'ABM3-ELBR-KE-THR' }), SALES)).toBe(true);
  });

  it('keeps the GM even though his role profile says IT', () => {
    /* THE REGRESSION THIS RULE EXISTS FOR. E00003 is the General Manager
       every ZSM and SM reports to, and his custom_role_profile is 'IT'.
       Letting the profile veto the ladder dropped him and left ten managers
       as false roots -- the tree lost its head. */
    expect(inSales(member({ short: 'GM', roleProfile: 'IT' }), SALES)).toBe(true);
  });

  it('keeps a BE whose profile was moved off Sales', () => {
    // The ladder is the truer signal where the two disagree.
    expect(inSales(member({ short: 'BE', roleProfile: 'Accounts' }), SALES)).toBe(true);
  });

  it('still drops a non-sales designation with a non-sales profile', () => {
    expect(inSales(member({ short: 'Accountant', roleProfile: 'Accounts' }), SALES)).toBe(false);
  });

  it('treats the Sales node itself as inside Sales', () => {
    expect(inSales(member({ roleProfile: 'Sales' }), SALES)).toBe(true);
  });
});
