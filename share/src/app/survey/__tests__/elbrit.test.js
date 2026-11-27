import { describe, expect, it } from 'vitest';
import { elbritPrompt, matchElbrit, tagElbrit, withElbrit } from '../../../../../lib/elbritProducts';

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
    expect(f._elbrit).toMatchObject({ lines: 3, elbrit: 2, others: 1, found: true, items: ['TELBRIT 40', 'ROZULA 10'], qty: 14, value: 1255 });
  });

  it('a secondary statement (Read as: Secondary statement) totals each column over Elbrit lines only', () => {
    const f = { rows: [
      { product: 'TELBRIT 40 TAB 10S', sales_qty: '19', sales_value: '6,080.00', closing_qty: '67', closing_value: '21440', elbrit_product: null },
      { product: 'TELMA 40', sales_qty: '50', sales_value: '9000', closing_qty: '10', closing_value: '1800', elbrit_product: null },
      { product: 'ROZULA 20', sales_qty: '5', sales_value: '900', closing_qty: '', closing_value: null, elbrit_product: 'ROZULA 20' },
    ] };
    tagElbrit(f, P);
    expect(f.rows.map((r) => r.elbrit_product)).toEqual(['TELBRIT 40', null, 'ROZULA 20']);
    expect(f._elbrit).toMatchObject({ elbrit: 2, others: 1, qty: 24, value: 6980, totals: { sales_qty: 24, sales_value: 6980, closing_qty: 67, closing_value: 21440 } });
  });

  it('a prescription (Read as: Prescription) counts the tablets of Elbrit medicines', () => {
    const f = { rows: [{ medicine: 'Tab Glimibrit M1', tablets: '30' }, { medicine: 'Tab Dolo 650', tablets: '10' }] };
    tagElbrit(f, P);
    expect(f._elbrit).toMatchObject({ elbrit: 1, found: true, items: ['GLIMIBRIT M1'], qty: 30, totals: { tablets: 30 } });
  });

  it('a prescription with no Elbrit medicine says so', () => {
    const f = { medicines: [{ medicine: 'Dolo 650', dose: '1-0-1' }] };
    tagElbrit(f, P);
    expect(f._elbrit).toMatchObject({ lines: 1, elbrit: 0, found: false, items: [] });
  });
});
