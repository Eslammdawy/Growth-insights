import { describe, expect, it } from 'vitest';
import sampleRows from '../src/lib/__fixtures__/sample.json';
import edgeRows from '../src/lib/__fixtures__/edge-cases.json';
import {
  DataError,
  datasetFromRows,
  decodeDataset,
  encodeDataset,
  numCol,
  strCol,
  validateDataset,
} from '../src/lib/columnar';
import { REQUIRED_COLUMNS, TX_TYPES } from '../src/lib/config';
import { AnalysisQuery, analyze, buildMeta, normTx } from '../src/lib/aggregate';
import { defaultSelection } from '../src/lib/periods';
import { optimizeDataset, round4 } from './convert';

describe('scripts/convert optimization helpers', () => {
  it('round4 rounds floating-point noise to 4 decimals, keeps integers and NaN, and normalizes -0', () => {
    expect(round4(12)).toBe(12);
    expect(round4(-102.871636363636)).toBe(-102.8716);
    expect(round4(0.0532544378698225)).toBe(0.0533);
    expect(round4(970.768000000002)).toBe(970.768);
    expect(Number.isNaN(round4(Number.NaN))).toBe(true);
    expect(round4(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Object.is(round4(-0.00001), 0)).toBe(true);
    expect(Object.is(round4(-0), 0)).toBe(true);
  });

  it('optimizeDataset strips non-required columns, drops Bonus/Return Bonus, compacts dicts, and sorts Item-first', () => {
    const base = edgeRows[0] as Record<string, unknown>;
    const inputRows: Record<string, unknown>[] = [
      // Later date & item appears first in input to verify deterministic Item-first sorting
      {
        ...base,
        Date: 202607,
        Line: 'Rota 2',
        Brand: 'Zeta',
        Item: 'Zeta 50mg',
        TransactionType: 'Sales',
        Quantity: 2.12346,
        Value: 100.55554,
        CustomerAddress: 'Addr 1',
        CustomerIDName: 'ID1 - Name',
        IsTender: 'No',
      },
      // Duplicate active tuple must NOT be collapsed (preserves matchedRows)
      {
        ...base,
        Date: 202607,
        Line: 'Rota 2',
        Brand: 'Zeta',
        Item: 'Zeta 50mg',
        TransactionType: 'Sales',
        Quantity: 1,
        Value: 50,
        CustomerAddress: 'Addr 2',
        CustomerIDName: 'ID1 - Name',
        IsTender: 'Yes',
      },
      // Bonus row with unique CustomerID & Item should be dropped and pruned from dictionaries
      {
        ...base,
        Date: 202507,
        Line: 'BonusLineOnly',
        Brand: 'BonusBrandOnly',
        Item: 'BonusItemOnly',
        CustomerID: 'BONUS-ONLY-CUST',
        CustomerName: 'Bonus Only Pharmacy',
        TransactionType: 'Bonus',
        Quantity: 99,
        Value: 999,
        CustomerAddress: 'Bonus Addr',
      },
      // Return Bonus row should also be dropped
      {
        ...base,
        Date: 202507,
        TransactionType: 'Return Bonus',
        Quantity: -5,
        Value: -50,
      },
      // Earlier date Sales & Return Sales
      {
        ...base,
        Date: 202507,
        Line: 'Rota 1',
        Brand: 'Alpha',
        Item: 'Alpha 10mg',
        TransactionType: 'Return Sales',
        Quantity: -1.00004,
        Value: -40.00006,
      },
      {
        ...base,
        Date: 202507,
        Line: 'Rota 1',
        Brand: 'Alpha',
        Item: 'Alpha 10mg',
        TransactionType: 'Sales',
        Quantity: 3,
        Value: 120,
      },
    ];

    const ds = datasetFromRows(inputRows);
    expect(ds.columns.length).toBeGreaterThan(REQUIRED_COLUMNS.length);

    const opt = optimizeDataset(ds);
    validateDataset(opt);

    // 1. Strictly the 15 REQUIRED_COLUMNS in canonical order
    expect(opt.columns.map((c) => c.name)).toEqual([...REQUIRED_COLUMNS]);

    // 2. Active rows only (4 of 6; exact active duplicate rows preserved)
    expect(opt.rowCount).toBe(4);

    // 3. Dictionary compaction removes dead Bonus-only entries and preserves dict[0] === ''
    const ttCol = strCol(opt, 'TransactionType');
    expect(ttCol.dict[0]).toBe('');
    expect(ttCol.dict).not.toContain('Bonus');
    expect(ttCol.dict).not.toContain('Return Bonus');
    expect(strCol(opt, 'Item').dict).not.toContain('BonusItemOnly');
    expect(strCol(opt, 'CustomerID').dict).not.toContain('BONUS-ONLY-CUST');
    for (const col of opt.columns) {
      if (col.kind === 'str') expect(col.dict[0]).toBe('');
    }

    // 4. Deterministic sorting: Date -> TransactionType -> Line -> Brand -> Item -> ... -> Quantity
    // ('Sales' precedes 'Return Sales' because 'Sales' appears earlier in TransactionType dict; within 202607 'Sales', 1 precedes 2.1235)
    const dates = numCol(opt, 'Date').values;
    const qtys = numCol(opt, 'Quantity').values;
    const vals = numCol(opt, 'Value').values;
    expect(Array.from(dates)).toEqual([202507, 202507, 202607, 202607]);
    expect(Array.from(qtys)).toEqual([3, -1, 1, 2.1235]);
    expect(Array.from(vals)).toEqual([120, -40.0001, 50, 100.5555]);
  });

  it('optimizeDataset preserves encode/decode round-trip and analysis parity on edge-cases and sample fixtures', () => {
    for (const rows of [edgeRows as Record<string, unknown>[], sampleRows as Record<string, unknown>[]]) {
      const origDs = datasetFromRows(rows);
      const optDs = optimizeDataset(origDs);
      const decoded = decodeDataset(JSON.parse(encodeDataset(optDs, { source: 'test' })));
      validateDataset(decoded);

      const expectedActiveRows = rows.filter((r) => normTx(String(r.TransactionType ?? '')) !== null).length;
      expect(decoded.rowCount).toBe(expectedActiveRows);

      const metaOrig = buildMeta(origDs);
      const q: AnalysisQuery = {
        period: defaultSelection(metaOrig.availability),
        txTypes: [...TX_TYPES],
        line: null,
        brands: [],
        items: [],
        mainTypes: [],
        drill: [],
      };
      const resOrig = analyze(origDs, q);
      const resOpt = analyze(decoded, q);

      expect(resOpt.matchedRows).toBe(resOrig.matchedRows);
      expect(resOpt.totals.pyQ).toBeCloseTo(resOrig.totals.pyQ, 1);
      expect(resOpt.totals.pyV).toBeCloseTo(resOrig.totals.pyV, 1);
      expect(resOpt.totals.cyQ).toBeCloseTo(resOrig.totals.cyQ, 1);
      expect(resOpt.totals.cyV).toBeCloseTo(resOrig.totals.cyV, 1);
      expect(resOpt.levels.subtype.length).toBe(resOrig.levels.subtype.length);
      expect(resOpt.levels.chain.length).toBe(resOrig.levels.chain.length);
      expect(resOpt.levels.customer.length).toBe(resOrig.levels.customer.length);
    }
  });

  it('optimizeDataset throws DataError("empty") when no Sales or Return Sales rows remain', () => {
    const onlyBonus = datasetFromRows([
      {
        ...(edgeRows[0] as Record<string, unknown>),
        TransactionType: 'Bonus',
      },
    ]);
    expect(() => optimizeDataset(onlyBonus)).toThrowError(DataError);
    try {
      optimizeDataset(onlyBonus);
    } catch (e) {
      expect((e as DataError).kind).toBe('empty');
    }
  });
});
