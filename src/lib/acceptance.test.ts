import { describe, expect, it } from 'vitest';
import sampleRows from './__fixtures__/sample.json';
import edgeRows from './__fixtures__/edge-cases.json';
import {
  DataError,
  datasetFromRows,
  decodeDataset,
  encodeDataset,
  validateDataset,
} from './columnar';
import { EXPANDABLE_SUBTYPES, TX_TYPES, UNASSIGNED_CHAIN_LABEL } from './config';
import {
  AnalysisQuery,
  LEVELS,
  analyze,
  buildMeta,
  brandOptions,
  itemOptions,
  sumRows,
} from './aggregate';
import {
  METRICS,
  deriveRow,
  growth,
  metricCells,
  ppg,
  ppgDecomposition,
} from './metrics';
import { fmtGrowth } from './format';
import { defaultSelection } from './periods';

const sampleDs = datasetFromRows(sampleRows as Record<string, unknown>[]);
const sampleMeta = buildMeta(sampleDs);
const baseQuery = (overrides: Partial<AnalysisQuery> = {}): AnalysisQuery => ({
  period: defaultSelection(sampleMeta.availability),
  txTypes: [...TX_TYPES],
  line: null,
  brands: [],
  items: [],
  mainTypes: [],
  drill: [],
  level: 'subtype',
  ...overrides,
});

describe('Acceptance tests (agent_prompt.v2.md)', () => {
  it('1. Sum of rows at every level equals the grand total, for every metric (Units, Value, PPG = ΣV/ΣQ)', () => {
    for (const level of LEVELS) {
      const res = analyze(sampleDs, baseQuery({ level }));
      const summed = sumRows(res.rows);
      expect(summed.pyQ).toBeCloseTo(res.totals.pyQ, 6);
      expect(summed.pyV).toBeCloseTo(res.totals.pyV, 4);
      expect(summed.cyQ).toBeCloseTo(res.totals.cyQ, 6);
      expect(summed.cyV).toBeCloseTo(res.totals.cyV, 4);

      for (const m of METRICS) {
        const totCells = metricCells(res.totals, m);
        const sumCells = metricCells(summed, m);
        expect(sumCells.py).toBeCloseTo(totCells.py!, 6);
        expect(sumCells.cy).toBeCloseTo(totCells.cy!, 6);
        expect(sumCells.delta).toBeCloseTo(totCells.delta!, 6);
      }
    }
  });

  it('2. Children of each expandable SubType (Chain, Private) sum to the parent row, including unassigned chain', () => {
    const res = analyze(sampleDs, baseQuery({ level: 'subtype' }));
    for (const expSub of EXPANDABLE_SUBTYPES) {
      const parent = res.rows.find((r) => r.value === expSub);
      expect(parent, `Expected SubType=${expSub} in sample fixture`).toBeDefined();
      expect(parent!.children && parent!.children.length > 0).toBe(true);
      const childSum = sumRows(parent!.children!);
      expect(childSum.pyQ).toBeCloseTo(parent!.sums.pyQ, 6);
      expect(childSum.pyV).toBeCloseTo(parent!.sums.pyV, 4);
      expect(childSum.cyQ).toBeCloseTo(parent!.sums.cyQ, 6);
      expect(childSum.cyV).toBeCloseTo(parent!.sums.cyV, 4);
    }
    const priv = res.rows.find((r) => r.value === 'Private')!;
    const unassignedChild = priv.children!.find((c) => c.label === UNASSIGNED_CHAIN_LABEL);
    expect(unassignedChild).toBeDefined();

    // Ezzaby is NOT expandable per Q3 decision
    const ezzaby = res.rows.find((r) => r.value === 'Ezzaby');
    expect(ezzaby?.children).toBeUndefined();
  });

  it('3. PPG at any aggregation equals total value / total units, never an average of row PPGs', () => {
    const res = analyze(sampleDs, baseQuery({ level: 'subtype' }));
    const totPpg = metricCells(res.totals, 'ppg');
    expect(totPpg.py).toBeCloseTo(res.totals.pyV / res.totals.pyQ, 8);
    expect(totPpg.cy).toBeCloseTo(res.totals.cyV / res.totals.cyQ, 8);

    const avgOfRowPpgs =
      res.rows.reduce((acc, r) => acc + (ppg(r.sums.cyV, r.sums.cyQ) ?? 0), 0) / res.rows.length;
    expect(Math.abs(totPpg.cy! - avgOfRowPpgs)).toBeGreaterThan(0.01);

    // PPG mode price + mix decomposition adds up to total PPG delta
    const dec = ppgDecomposition(
      res.rows.map((r) => r.sums),
      res.totals,
    );
    expect(dec.priceEffect + (dec.mixEffect ?? 0)).toBeCloseTo(dec.totalDelta!, 8);
  });

  it('4. Like-for-like ON with partial CY (only 202607): PY includes only 202507 and CY only 202607', () => {
    const edgeDs = datasetFromRows(edgeRows as Record<string, unknown>[]);
    const edgeMeta = buildMeta(edgeDs);
    const sel = defaultSelection(edgeMeta.availability);
    expect(sel.likeForLike).toBe(true);

    const lflOn = analyze(edgeDs, {
      ...baseQuery({ period: { ...sel, likeForLike: true } }),
    });
    expect(lflOn.period.pyPeriods).toEqual([202507]);
    expect(lflOn.period.cyPeriods).toEqual([202607]);
    expect(lflOn.period.banner).toContain('Comparing Jul-26 vs Jul-25 (like-for-like)');
    // PY July Sales: C-100 (100, 5000) + C-300 (80, 8000) + C-400 (20-20=0, 1000-1000=0) = 180 units, 13000 value
    expect(lflOn.totals.pyQ).toBeCloseTo(180, 6);
    expect(lflOn.totals.pyV).toBeCloseTo(13000, 6);
    // CY July Sales: C-100 (150, 9000) + C-200 (50, 4000) = 200 units, 13000 value
    expect(lflOn.totals.cyQ).toBeCloseTo(200, 6);
    expect(lflOn.totals.cyV).toBeCloseTo(13000, 6);

    // When like-for-like is OFF, PY includes full Q3 (202507, 202508, 202509)
    const lflOff = analyze(edgeDs, {
      ...baseQuery({ period: { ...sel, likeForLike: false } }),
    });
    expect(lflOff.period.pyPeriods).toEqual([202507, 202508, 202509]);
    expect(lflOff.totals.pyQ).toBeCloseTo(180 + 200 + 300, 6);
  });

  it('5. Growth edge cases: PY=0 -> "New", CY=0 with PY>0 -> -100.0% ("lost"), both 0 -> "–"', () => {
    const edgeDs = datasetFromRows(edgeRows as Record<string, unknown>[]);
    const edgeMeta = buildMeta(edgeDs);
    const res = analyze(edgeDs, baseQuery({ period: defaultSelection(edgeMeta.availability), level: 'customer' }));

    const cNew = res.rows.find((r) => r.value === 'C-200')!;
    const dNew = deriveRow(cNew.sums, res.totals, 'value');
    expect(dNew.growth.kind).toBe('new');
    expect(fmtGrowth(dNew.growth)).toBe('New');
    expect(dNew.status).toBe('new');

    const cLost = res.rows.find((r) => r.value === 'C-300')!;
    const dLost = deriveRow(cLost.sums, res.totals, 'value');
    expect(dLost.growth.kind).toBe('lost');
    expect(fmtGrowth(dLost.growth)).toBe('−100.0%');
    expect(dLost.status).toBe('lost');

    const cZero = res.rows.find((r) => r.value === 'C-400')!;
    const dZero = deriveRow(cZero.sums, res.totals, 'value');
    expect(dZero.growth.kind).toBe('none');
    expect(fmtGrowth(dZero.growth)).toBe('–');
    expect(metricCells(cZero.sums, 'ppg').py).toBeNull();

    // Direct unit checks
    expect(growth(0, 150)).toEqual({ kind: 'new' });
    expect(growth(100, 0)).toEqual({ kind: 'lost', value: -1 });
    expect(growth(0, 0)).toEqual({ kind: 'none' });
  });

  it('6. Changing Line tab or Brand filter updates KPI totals and all level tables consistently', () => {
    const targetLine = sampleMeta.lines[0];
    const brandsInLine = brandOptions(sampleMeta, targetLine);
    expect(brandsInLine.length).toBeGreaterThan(0);
    const chosenBrand = brandsInLine[0];
    const itemsInBrand = itemOptions(sampleMeta, targetLine, [chosenBrand]);
    expect(itemsInBrand.length).toBeGreaterThan(0);

    const baseline = analyze(sampleDs, baseQuery({ level: 'territory' }));
    const byLine = analyze(sampleDs, baseQuery({ line: targetLine, level: 'territory' }));
    expect(byLine.totals.cyV).toBeLessThan(baseline.totals.cyV);

    for (const lvl of LEVELS) {
      const r = analyze(
        sampleDs,
        baseQuery({ line: targetLine, brands: [chosenBrand], level: lvl }),
      );
      const s = sumRows(r.rows);
      expect(s.cyV).toBeCloseTo(r.totals.cyV, 5);
      expect(s.pyV).toBeCloseTo(r.totals.pyV, 5);
      expect(s.cyQ).toBeCloseTo(r.totals.cyQ, 5);
      expect(s.pyQ).toBeCloseTo(r.totals.pyQ, 5);
      // Sidebar badges ignore Brand/Item filters
      expect(r.linesTotal.cyV).toBeCloseTo(baseline.linesTotal.cyV, 5);
    }
  });

  it('7. Bonus and Return Bonus rows never affect any metric', () => {
    const edgeDs = datasetFromRows(edgeRows as Record<string, unknown>[]);
    const withoutBonus = datasetFromRows(
      (edgeRows as Record<string, unknown>[]).filter(
        (r) => r.TransactionType !== 'Bonus' && r.TransactionType !== 'Return Bonus',
      ),
    );
    const meta1 = buildMeta(edgeDs);
    const r1 = analyze(edgeDs, baseQuery({ period: defaultSelection(meta1.availability), level: 'subtype' }));
    const r2 = analyze(withoutBonus, baseQuery({ period: defaultSelection(meta1.availability), level: 'subtype' }));
    expect(r1.totals).toEqual(r2.totals);
  });

  it('8. Customer-level Brick/SubType comes from the most recent month (CY first) and +N lists prior values', () => {
    const edgeDs = datasetFromRows(edgeRows as Record<string, unknown>[]);
    const edgeMeta = buildMeta(edgeDs);
    const res = analyze(edgeDs, baseQuery({ period: defaultSelection(edgeMeta.availability), level: 'customer' }));
    const c100 = res.rows.find((r) => r.value === 'C-100')!;
    // In 202507..09 C-100 was Brick="Cairo East 1", SubType="Chain"; in 202607 it moved to "Cairo East 2", "Private"
    expect(c100.brick).toBe('Cairo East 2');
    expect(c100.brickOthers).toEqual(['Cairo East 1']);
    expect(c100.subType).toBe('Private');
    expect(c100.subTypeOthers).toEqual(['Chain']);
  });

  it('9. Columnar converter round-trip preserves row counts and all totals', () => {
    const json = encodeDataset(sampleDs, { source: 'sample.json' });
    const decoded = decodeDataset(JSON.parse(json));
    validateDataset(decoded);
    expect(decoded.rowCount).toBe(sampleDs.rowCount);
    const a = analyze(sampleDs, baseQuery({ level: 'brick' }));
    const b = analyze(decoded, baseQuery({ level: 'brick' }));
    expect(b.totals.pyQ).toBeCloseTo(a.totals.pyQ, 6);
    expect(b.totals.pyV).toBeCloseTo(a.totals.pyV, 4);
    expect(b.totals.cyQ).toBeCloseTo(a.totals.cyQ, 6);
    expect(b.totals.cyV).toBeCloseTo(a.totals.cyV, 4);
  });

  it('Validation throws descriptive errors for missing columns and bad Date formats', () => {
    const missingDs = datasetFromRows([{ Date: 202607, Line: 'Rota 1' }]);
    expect(() => validateDataset(missingDs)).toThrowError(DataError);
    try {
      validateDataset(missingDs);
    } catch (e) {
      const err = e as DataError;
      expect(err.kind).toBe('missing-columns');
      expect(err.details).toContain('Brand');
      expect(err.details).toContain('CustomerID');
    }

    const badDateRows = [{ ...(edgeRows[0] as Record<string, unknown>), Date: 202613 }];
    const badDateDs = datasetFromRows(badDateRows);
    expect(() => validateDataset(badDateDs)).toThrowError(/YYYYMM/);
  });
});
