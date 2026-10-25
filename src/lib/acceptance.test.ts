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
  analyzeItems,
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
} from './metrics';
import { fmtGrowth } from './format';
import { defaultSelection } from './periods';
import { parseHashParams, serializeHashState, validateHashAgainstMeta } from './hashState';

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
  ...overrides,
});

describe('Acceptance tests (Sales Growth Analyzer)', () => {
  it('1. Sum of rows at every non-excluded level equals the grand total, and Distributor excludes Ezaby', () => {
    const res = analyze(sampleDs, baseQuery());
    expect(res.levels.distributor.find((r) => r.value.toLowerCase() === 'ezaby')).toBeUndefined();
    for (const level of LEVELS.filter((l) => l !== 'distributor')) {
      const rows = res.levels[level];
      expect(rows.length).toBeGreaterThan(0);
      const summed = sumRows(rows);
      expect(summed.pyQ).toBeCloseTo(res.totals.pyQ, 6);
      expect(summed.pyV).toBeCloseTo(res.totals.pyV, 4);
      expect(summed.cyQ).toBeCloseTo(res.totals.cyQ, 6);
      expect(summed.cyV).toBeCloseTo(res.totals.cyV, 4);

      for (const m of METRICS) {
        const totCells = metricCells(res.totals, m);
        const sumCells = metricCells(summed, m);
        expect(sumCells.py).toBeCloseTo(totCells.py, 6);
        expect(sumCells.cy).toBeCloseTo(totCells.cy, 6);
        expect(sumCells.delta).toBeCloseTo(totCells.delta, 6);
      }
    }
  });

  it('2. Children of each expandable SubType (Chain, Private) sum to the parent row, including unassigned chain', () => {
    const res = analyze(sampleDs, baseQuery());
    const subtypeRows = res.levels.subtype;
    for (const expSub of EXPANDABLE_SUBTYPES) {
      const parent = subtypeRows.find((r) => r.value === expSub);
      expect(parent, `Expected SubType=${expSub} in sample fixture`).toBeDefined();
      expect(parent!.children && parent!.children.length > 0).toBe(true);
      const childSum = sumRows(parent!.children!);
      expect(childSum.pyQ).toBeCloseTo(parent!.sums.pyQ, 6);
      expect(childSum.pyV).toBeCloseTo(parent!.sums.pyV, 4);
      expect(childSum.cyQ).toBeCloseTo(parent!.sums.cyQ, 6);
      expect(childSum.cyV).toBeCloseTo(parent!.sums.cyV, 4);
    }
    const priv = subtypeRows.find((r) => r.value === 'Private')!;
    const unassignedChild = priv.children!.find((c) => c.label === UNASSIGNED_CHAIN_LABEL);
    expect(unassignedChild).toBeDefined();

    // Ezzaby is NOT expandable per Q3 decision
    const ezzaby = subtypeRows.find((r) => r.value === 'Ezzaby');
    expect(ezzaby?.children).toBeUndefined();
  });

  it('3. Per-row Item drilldown (analyzeItems) returns items summing to the parent entity for any level and chain child', () => {
    const q = baseQuery();
    const res = analyze(sampleDs, q);
    for (const level of LEVELS) {
      const top = res.levels[level][0];
      expect(top).toBeDefined();
      const items = analyzeItems(sampleDs, q, { level, value: top.value });
      expect(items.length).toBeGreaterThan(0);
      const itemSums = sumRows(items);
      expect(itemSums.pyQ).toBeCloseTo(top.sums.pyQ, 6);
      expect(itemSums.pyV).toBeCloseTo(top.sums.pyV, 4);
      expect(itemSums.cyQ).toBeCloseTo(top.sums.cyQ, 6);
      expect(itemSums.cyV).toBeCloseTo(top.sums.cyV, 4);
    }

    // Chain child of an expandable SubType
    const chainSub = res.levels.subtype.find((r) => r.value === 'Chain')!;
    const chainChild = chainSub.children![0];
    const childItems = analyzeItems(sampleDs, q, {
      level: 'subtype',
      value: 'Chain',
      chain: chainChild.value,
    });
    expect(childItems.length).toBeGreaterThan(0);
    const childItemSums = sumRows(childItems);
    expect(childItemSums.pyQ).toBeCloseTo(chainChild.sums.pyQ, 6);
    expect(childItemSums.pyV).toBeCloseTo(chainChild.sums.pyV, 4);
    expect(childItemSums.cyQ).toBeCloseTo(chainChild.sums.cyQ, 6);
    expect(childItemSums.cyV).toBeCloseTo(chainChild.sums.cyV, 4);
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
    const res = analyze(edgeDs, baseQuery({ period: defaultSelection(edgeMeta.availability) }));

    const cNew = res.levels.customer.find((r) => r.customerId === 'C-200')!;
    const dNew = deriveRow(cNew.sums, 'value');
    expect(dNew.growth.kind).toBe('new');
    expect(fmtGrowth(dNew.growth)).toBe('New');
    expect(dNew.status).toBe('new');

    const cLost = res.levels.customer.find((r) => r.customerId === 'C-300')!;
    const dLost = deriveRow(cLost.sums, 'value');
    expect(dLost.growth.kind).toBe('lost');
    expect(fmtGrowth(dLost.growth)).toBe('−100.0%');
    expect(dLost.status).toBe('lost');

    const cZero = res.levels.customer.find((r) => r.customerId === 'C-400')!;
    const dZero = deriveRow(cZero.sums, 'value');
    expect(dZero.growth.kind).toBe('none');
    expect(fmtGrowth(dZero.growth)).toBe('–');

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

    const baseline = analyze(sampleDs, baseQuery());
    const byLine = analyze(sampleDs, baseQuery({ line: targetLine }));
    expect(byLine.totals.cyV).toBeLessThan(baseline.totals.cyV);

    const r = analyze(
      sampleDs,
      baseQuery({ line: targetLine, brands: [chosenBrand] }),
    );
    for (const lvl of LEVELS.filter((l) => l !== 'distributor')) {
      const s = sumRows(r.levels[lvl]);
      expect(s.cyV).toBeCloseTo(r.totals.cyV, 5);
      expect(s.pyV).toBeCloseTo(r.totals.pyV, 5);
      expect(s.cyQ).toBeCloseTo(r.totals.cyQ, 5);
      expect(s.pyQ).toBeCloseTo(r.totals.pyQ, 5);
    }
    // Sidebar badges ignore Brand/Item filters
    expect(r.linesTotal.cyV).toBeCloseTo(baseline.linesTotal.cyV, 5);
  });

  it('7. Bonus and Return Bonus rows never affect any metric', () => {
    const edgeDs = datasetFromRows(edgeRows as Record<string, unknown>[]);
    const withoutBonus = datasetFromRows(
      (edgeRows as Record<string, unknown>[]).filter(
        (r) => r.TransactionType !== 'Bonus' && r.TransactionType !== 'Return Bonus',
      ),
    );
    const meta1 = buildMeta(edgeDs);
    const r1 = analyze(edgeDs, baseQuery({ period: defaultSelection(meta1.availability) }));
    const r2 = analyze(withoutBonus, baseQuery({ period: defaultSelection(meta1.availability) }));
    expect(r1.totals).toEqual(r2.totals);
  });

  it('8. Customer identity: same CustomerID + CustomerName considered one customer; CY Brick & Territory persist across all years', () => {
    const edgeDs = datasetFromRows(edgeRows as Record<string, unknown>[]);
    const edgeMeta = buildMeta(edgeDs);
    const q = baseQuery({ period: defaultSelection(edgeMeta.availability) });
    const res = analyze(edgeDs, q);

    // Customer C-100 ("صيدلية الشفاء") moved from Brick="Cairo East 1" (PY) to Brick="Cairo East 2" (CY).
    // Even though the Brick changed, it is ONE customer row with both PY (100 units, 5000 value) and CY (150 units, 9000 value).
    const c100Rows = res.levels.customer.filter((r) => r.customerId === 'C-100');
    expect(c100Rows.length).toBe(1);
    const c100 = c100Rows[0];
    expect(c100.label).toBe('صيدلية الشفاء');
    expect(c100.brick).toBe('Cairo East 2');
    expect(c100.brickOthers).toEqual(['Cairo East 1']);
    expect(c100.subType).toBe('Private');
    expect(c100.subTypeOthers).toEqual(['Chain']);
    expect(c100.sums).toEqual({ pyQ: 100, pyV: 5000, cyQ: 150, cyV: 9000 });

    // In the Brick table, C-100's PY sales (100 units, 5000 value) are mapped to its updated true CY brick "Cairo East 2",
    // and the old PY brick "Cairo East 1" has no remaining sales.
    const brickCe1 = res.levels.brick.find((r) => r.value === 'Cairo East 1');
    expect(brickCe1).toBeUndefined();
    const brickCe2 = res.levels.brick.find((r) => r.value === 'Cairo East 2')!;
    expect(brickCe2.sums).toEqual({ pyQ: 100, pyV: 5000, cyQ: 150, cyV: 9000 });

    // Item drill-down on the CY brick includes both PY and CY sales of that customer
    const brickItems = analyzeItems(edgeDs, q, { level: 'brick', value: 'Cairo East 2' });
    expect(sumRows(brickItems)).toEqual({ pyQ: 100, pyV: 5000, cyQ: 150, cyV: 9000 });
  });

  it('9. Columnar converter round-trip preserves row counts and all totals', () => {
    const json = encodeDataset(sampleDs, { source: 'sample.json' });
    const decoded = decodeDataset(JSON.parse(json));
    validateDataset(decoded);
    expect(decoded.rowCount).toBe(sampleDs.rowCount);
    const a = analyze(sampleDs, baseQuery());
    const b = analyze(decoded, baseQuery());
    expect(b.totals.pyQ).toBeCloseTo(a.totals.pyQ, 6);
    expect(b.totals.pyV).toBeCloseTo(a.totals.pyV, 4);
    expect(b.totals.cyQ).toBeCloseTo(a.totals.cyQ, 6);
    expect(b.totals.cyV).toBeCloseTo(a.totals.cyV, 4);
  });

  it('11. decodeDataset rejects invalid format and non-object payloads', () => {
    expect(() => decodeDataset(null)).toThrowError(DataError);
    expect(() => decodeDataset('<!doctype html>')).toThrowError(DataError);
    expect(() => decodeDataset({ format: 'wrong' })).toThrowError(DataError);
  });

  it('10. Validation throws descriptive errors for missing columns and bad Date formats', () => {
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

  it('12. URL hash state round-trips correctly and validates against dataset meta', () => {
    const original = {
      metric: 'units' as const,
      line: sampleMeta.lines[0] ?? 'Rota 1',
      period: { cyYear: 2026, pyYear: 2025, quarter: 3, month: 8, likeForLike: false },
      mainTypes: [sampleMeta.mainTypes[0] ?? 'Hospital'],
      txTypes: ['Sales'] as ('Sales' | 'Return Sales')[],
      brands: brandOptions(sampleMeta, sampleMeta.lines[0]).slice(0, 1),
      items: itemOptions(sampleMeta, sampleMeta.lines[0], []).slice(0, 1),
      drill: [{ field: 'SubType' as const, value: 'Chain', label: 'Chain' }],
    };

    const hash = serializeHashState(original);
    expect(hash.startsWith('#')).toBe(true);

    const parsed = parseHashParams(hash);
    expect(parsed.metric).toBe('units');
    expect(parsed.line).toBe(original.line);
    expect(parsed.cyYear).toBe(2026);
    expect(parsed.quarter).toBe(3);
    expect(parsed.month).toBe(8);
    expect(parsed.likeForLike).toBe(false);
    expect(parsed.txTypes).toEqual(['Sales']);
    expect(parsed.drill).toEqual([{ field: 'SubType', value: 'Chain', label: 'Chain' }]);

    const defPeriod = defaultSelection(sampleMeta.availability);
    const validated = validateHashAgainstMeta(parsed, sampleMeta, defPeriod);
    expect(validated.metric).toBe('units');
    expect(validated.line).toBe(original.line);
    expect(validated.period.cyYear).toBe(2026);
    expect(validated.period.quarter).toBe(3);
    expect(validated.period.month).toBe(8);
    expect(validated.period.likeForLike).toBe(false);
    expect(validated.txTypes).toEqual(['Sales']);
    expect(validated.drill).toEqual([{ field: 'SubType', value: 'Chain', label: 'Chain' }]);

    // Invalid parameters fall back to safe defaults
    const invalidParsed = parseHashParams('#line=NonExistentLine&year=1990&q=9&m=99&metric=invalid&txTypes=Unknown&drill=malformed{json');
    const safeValidated = validateHashAgainstMeta(invalidParsed, sampleMeta, defPeriod);
    expect(safeValidated.line).toBeNull();
    expect(safeValidated.metric).toBeUndefined();
    expect(safeValidated.period.cyYear).toBe(defPeriod.cyYear);
    expect(safeValidated.period.quarter).toBe(defPeriod.quarter);
    expect(safeValidated.period.month).toBeNull();
    expect(safeValidated.txTypes).toEqual(['Sales', 'Return Sales']);
    expect(safeValidated.drill).toEqual([]);
  });
});
