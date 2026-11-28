import { describe, expect, it } from 'vitest';
import { elbritPrompt, erpMonth, matchElbrit, tagElbrit, withElbrit } from '../../../../../lib/elbritProducts';

/* 28 Nov 2026 · a few of Elbrit's products as the ERP lists them (Item group "Products") */
const P = ['TELBRIT 20', 'TELBRIT 40', 'TELBRIT AM', 'TELBRIT NB 40/5', 'ROZULA 10', 'ROZULA 20', 'ROZULA CV 10', 'GLIMIBRIT M1', 'GLIMIBRIT M1 FORTE', 'MY GUT', 'C 500', 'MYWASH 100 ML', 'SITADOC M 50 / 500'];

describe('Elbrit products in AI reads', () => {
  it('matches a written line to the exact ERP product, the most specific one', () => {
    expect(matchElbrit('Tab. Telbrit 40mg', P)).toEqual({ item: 'TELBRIT 40', family: 'TELBRIT' });
    expect(matchElbrit('Telbrit40', P).item).toBe('TELBRIT 40');
    expect(matchElbrit('Telbrit NB 40/5', P).item).toBe('TELBRIT NB 40/5');
    expect(matchElbrit('Glimibrit M1 Forte', P).item).toBe('GLIMIBRIT M1 FORTE');
    expect(matchElbrit('Sitadoc M 50/500', P).item).toBe('SITADOC M 50 / 500');
    expect(matchElbrit('Mywash 100ml', P).item).toBe('MYWASH 100 ML');
    expect(matchElbrit('My Gut', P).item).toBe('MY GUT');
  });

  it('keeps only the family when the strength cannot be read, and one wrong letter is forgiven', () => {
    expect(matchElbrit('Tab Telbrit', P)).toEqual({ item: null, family: 'TELBRIT' });
    expect(matchElbrit('Telbit 40', P).item).toBe('TELBRIT 40');
  });

  it("leaves other companies' medicines out", () => {
    for (const t of ['Dolo 650', 'Telmisartan 40', 'Ecosprin 75', 'Pantop 40', 'Myospaz', 'Vitamin C']) expect(matchElbrit(t, P)).toBeNull();
  });

  it('adds the Elbrit column to every table and lists the products for the AI', () => {
    const sc = withElbrit({ type: 'object', properties: { doctor: { type: 'string' }, rows: { type: 'array', items: { type: 'object', properties: { medicine: { type: 'string' } } } } } });
    expect(Object.keys(sc.properties.rows.items.properties)).toEqual(['medicine', 'elbrit_product']);
    expect(elbritPrompt(P)).toContain('TELBRIT NB 40/5');
  });

  it('tags each line and counts only the Elbrit lines and their value', () => {
    const f = { rows: [
      { product: 'TELBRIT 40', qty: '10', rate: '85.50', amount: '855.00', elbrit_product: 'TELBRIT 40' },
      { product: 'Dolo 650', qty: '5', amount: '150', elbrit_product: null },
      { product: 'Rozula 10', qty: '4', rate: '100', elbrit_product: 'ROZULA 20' },
    ] };
    tagElbrit(f, P);
    expect(f.rows.map((r) => r.elbrit_product)).toEqual(['TELBRIT 40', null, 'ROZULA 10']);
    expect(f.elbrit_summary).toMatchObject({ lines: 3, elbrit: 2, others: 1, found: true, items: ['TELBRIT 40', 'ROZULA 10'], qty: 14, value: 1255 });
  });

  it('a secondary statement (Read as: Secondary statement) totals each column over Elbrit lines only', () => {
    const f = { rows: [
      { product: 'TELBRIT 40 TAB 10S', sales_qty: '19', sales_value: '6,080.00', closing_qty: '67', closing_value: '21440', elbrit_product: null },
      { product: 'TELMA 40', sales_qty: '50', sales_value: '9000', closing_qty: '10', closing_value: '1800', elbrit_product: null },
      { product: 'ROZULA 20', sales_qty: '5', sales_value: '900', closing_qty: '', closing_value: null, elbrit_product: 'ROZULA 20' },
    ] };
    tagElbrit(f, P);
    expect(f.rows.map((r) => r.elbrit_product)).toEqual(['TELBRIT 40', null, 'ROZULA 20']);
    expect(f.elbrit_summary).toMatchObject({ elbrit: 2, others: 1, qty: 24, value: 6980, totals: { sales_qty: 24, sales_value: 6980, closing_qty: 67, closing_value: 21440 } });
  });

  it('a prescription (Read as: Prescription) counts the tablets of Elbrit medicines', () => {
    const f = { rows: [{ medicine: 'Tab Glimibrit M1', tablets: '30' }, { medicine: 'Tab Dolo 650', tablets: '10' }] };
    tagElbrit(f, P);
    expect(f.elbrit_summary).toMatchObject({ elbrit: 1, found: true, items: ['GLIMIBRIT M1'], qty: 30, totals: { tablets: 30 } });
  });

  it('turns the statement period into the ERP month (Secondary Data Entry date, Doctor Support period)', () => {
    expect(erpMonth('01/11/2026 to 26/11/2026')).toEqual({ date: '2026-11-01', period: '2026-November' });
    expect(erpMonth('Nov 2026')).toEqual({ date: '2026-11-01', period: '2026-November' });
    expect(erpMonth('2026-July')).toEqual({ date: '2026-07-01', period: '2026-July' });
    expect(erpMonth('27/11/26')).toEqual({ date: '2026-11-01', period: '2026-November' });
    expect(erpMonth('')).toBeNull();
  });

  it('Read as Secondary statement: what the ERP entry needs, Elbrit lines only, and what is missing', () => {
    // the sample statement's layout (Product, Pack, Opening, Receipt, Sales, Closing) with Elbrit products in it
    const f = { distributor_name: 'Buddha Medical Agencies, Ayodhya', statement_month: '01/11/2026 to 26/11/2026', rows: [
      { product: 'Telbrit 40 Tab', sales_qty: '95', closing_qty: '45' },
      { product: 'Derma Soft Cream', sales_qty: '60', closing_qty: '25' },
      { product: 'Rozula 10', sales_qty: null, closing_qty: null },
    ] };
    tagElbrit(f, P);
    expect(f.elbrit_summary).toMatchObject({ month: { date: '2026-11-01', period: '2026-November' }, elbrit: 2, others: 1, items: ['TELBRIT 40', 'ROZULA 10'], totals: { sales_qty: 95, closing_qty: 45 }, no_qty: 1 });
    expect(f.elbrit_summary.missing).toBeUndefined();
  });

  it('Read as Support statement: one line per doctor and product; a missing period is flagged', () => {
    const f = { distributor_name: 'Buddha Medical Agencies', period: null, rows: [
      { doctor_name: 'Dr A Upadhyay', product: 'Telbrit 20 Tab', qty: '20', amount: '2,840' },
      { doctor_name: 'Dr A K Gupta', product: 'Derma Soft Cream', qty: '12', amount: '1,980' },
    ] };
    tagElbrit(f, P);
    expect(f.rows.map((r) => r.elbrit_product)).toEqual(['TELBRIT 20', null]);
    expect(f.elbrit_summary).toMatchObject({ elbrit: 1, qty: 20, value: 2840, missing: ['period'] });
  });

  it('a prescription with no Elbrit medicine says so', () => {
    const f = { medicines: [{ medicine: 'Dolo 650', dose: '1-0-1' }] };
    tagElbrit(f, P);
    expect(f.elbrit_summary).toMatchObject({ lines: 1, elbrit: 0, found: false, items: [] });
  });
});

/* 28 Nov 2026 · the ERP's server scripts refuse any key starting with "_" (the read was lost): none may be saved */
describe('what the AI reader saves', () => {
  it('has no key starting with "_" (the ERP refuses them)', () => {
    const f = { distributor_name: 'Buddha Medical Agencies', statement_month: '01/11/2026 to 26/11/2026', rows: [{ product: 'Telbrit 40', sales_qty: '9' }] };
    tagElbrit(f, ['TELBRIT 40']);
    const keys = [];
    const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { keys.push(k); walk(v); } };
    walk(f);
    expect(keys.filter((k) => k.startsWith('_'))).toEqual([]);
    expect(f.elbrit_summary).toMatchObject({ elbrit: 1, month: { period: '2026-November' } });
  });
});

/* 28 Nov 2026 · Focus Medisales' statement prints Item, Pack, Op.Qty/Val, P.Qty/Val, S.Qty, S.Val, Cls.Qty, Cls.Val —
   no rate: it is worked out as value ÷ quantity (sales first, closing when nothing was sold), never added up */
describe('rate on a secondary statement', () => {
  it('works the rate out from value ÷ qty when the statement prints none', () => {
    const P = ['BRITVIT', 'BRITVOG 0.3', 'CALBRIT CT'];
    const f = { rows: [
      { product: 'BRITVIT TAB', sales_qty: '16', sales_value: '1219.04', closing_qty: '15', closing_value: '1142.85', rate: null },
      { product: 'BRITVOG 0.3MG TAB', sales_qty: '0', sales_value: '-', closing_qty: '14', closing_value: '1400.00', rate: null },
      { product: 'CALBRIT CT TAB', sales_qty: '4', sales_value: '542.40', closing_qty: '10', closing_value: '1356.00', rate: '135.60' },
    ] };
    tagElbrit(f, P);
    expect(f.rows.map((r) => r.rate)).toEqual(['76.19', '100', '135.60']);
    expect(f.elbrit_summary.rates_worked_out).toBe(2);
    expect(f.elbrit_summary.totals.rate).toBeUndefined();
    expect(f.elbrit_summary.totals).toMatchObject({ sales_qty: 20, sales_value: 1761.44, closing_qty: 39 });
  });
});
