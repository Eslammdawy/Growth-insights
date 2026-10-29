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
import { EXPANDABLE_SUBTYPES, TX_TYPES, UNASSIGNED_CHAIN_LABEL, UNASSIGNED_LABEL } from './config';
import {
  AnalysisQuery,
  INSIGHT_LEVELS,
  LEVELS,
  analyze,
  analyzeItems,
  buildMeta,
  brandOptions,
  itemOptions,
  subTypeOptions,
  sumRows,
} from './aggregate';
import {
  CUSTOMER_SEGMENTS,
  METRICS,
  classifyCustomerSegment,
  computeCustomerInsightsForMetric,
  contributionPp,
  decomposePriceVolume,
  deriveReturnsSums,
  deriveRow,
  growth,
  isReturnsFlagged,
  metricCells,
  priceVolumeRow,
  returnsRatePct,
} from './metrics';
import { fmtGrowth, fmtPrice, fmtSignedPrice } from './format';
import { DRIVER_LEVELS, buildHeadline, buildWaterfall, growthConcentration } from './insights';
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
    for (const level of LEVELS.filter((l) => l !== 'distributor' && l !== 'chain')) {
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

    // Dedicated Chain level has only named chains and excludes unassigned
    const chainRows = res.levels.chain;
    expect(chainRows.length).toBeGreaterThan(0);
    for (const r of chainRows) {
      expect(r.value).toBeTruthy();
      expect(r.label).not.toBe(UNASSIGNED_LABEL);
      expect(r.label).not.toBe(UNASSIGNED_CHAIN_LABEL);
    }
  });

  it('2. Children of each expandable SubType (Chain) sum to the parent row', () => {
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
    expect(priv.children).toBeUndefined();

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
    for (const lvl of LEVELS.filter((l) => l !== 'distributor' && l !== 'chain')) {
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

  it('13. Territory × Month matrix (Visual 2) reconciles horizontally to Territory totals and vertically to Month buckets', () => {
    const res = analyze(sampleDs, baseQuery());
    expect(res.territoryMonths.length).toBe(res.levels.territory.length);

    // Horizontal check: sum across months for each territory equals territory.sums
    for (const tm of res.territoryMonths) {
      const mSums = tm.months.reduce(
        (acc, b) => ({
          pyQ: acc.pyQ + b.sums.pyQ,
          pyV: acc.pyV + b.sums.pyV,
          cyQ: acc.cyQ + b.sums.cyQ,
          cyV: acc.cyV + b.sums.cyV,
        }),
        { pyQ: 0, pyV: 0, cyQ: 0, cyV: 0 },
      );
      expect(mSums.pyQ).toBeCloseTo(tm.sums.pyQ, 6);
      expect(mSums.pyV).toBeCloseTo(tm.sums.pyV, 4);
      expect(mSums.cyQ).toBeCloseTo(tm.sums.cyQ, 6);
      expect(mSums.cyV).toBeCloseTo(tm.sums.cyV, 4);
    }

    // Vertical check: sum across territories for each month index equals res.months[idx].sums
    for (let mIdx = 0; mIdx < res.months.length; mIdx++) {
      const colSums = res.territoryMonths.reduce(
        (acc, tm) => ({
          pyQ: acc.pyQ + tm.months[mIdx].sums.pyQ,
          pyV: acc.pyV + tm.months[mIdx].sums.pyV,
          cyQ: acc.cyQ + tm.months[mIdx].sums.cyQ,
          cyV: acc.cyV + tm.months[mIdx].sums.cyV,
        }),
        { pyQ: 0, pyV: 0, cyQ: 0, cyV: 0 },
      );
      expect(colSums.pyQ).toBeCloseTo(res.months[mIdx].sums.pyQ, 6);
      expect(colSums.pyV).toBeCloseTo(res.months[mIdx].sums.pyV, 4);
      expect(colSums.cyQ).toBeCloseTo(res.months[mIdx].sums.cyQ, 6);
      expect(colSums.cyV).toBeCloseTo(res.months[mIdx].sums.cyV, 4);
    }
  });

  it('14. Phase 4 Contribution-to-Growth (pp) and CY Share reconcile across all non-excluded insight levels', () => {
    const res = analyze(sampleDs, baseQuery());
    const totalGrowthV_pp = ((res.totals.cyV - res.totals.pyV) / res.totals.pyV) * 100;
    const totalGrowthQ_pp = ((res.totals.cyQ - res.totals.pyQ) / res.totals.pyQ) * 100;

    for (const lvl of INSIGHT_LEVELS.filter((l) => l !== 'distributor')) {
      const rows = res.insights.byLevel[lvl];
      expect(rows.length).toBeGreaterThan(0);

      const sumContribV = rows.reduce((s, r) => s + (r.valueContribPp ?? 0), 0);
      const sumContribQ = rows.reduce((s, r) => s + (r.unitsContribPp ?? 0), 0);
      const sumShareV = rows.reduce((s, r) => s + (r.valueShareCy ?? 0), 0);
      const sumShareQ = rows.reduce((s, r) => s + (r.unitsShareCy ?? 0), 0);

      expect(sumContribV).toBeCloseTo(totalGrowthV_pp, 6);
      expect(sumContribQ).toBeCloseTo(totalGrowthQ_pp, 6);
      expect(sumShareV).toBeCloseTo(1.0, 6);
      expect(sumShareQ).toBeCloseTo(1.0, 6);
    }
  });

  it('15. Phase 4 Price / Volume / Mix decomposition satisfies exact additivity and handles edge cases', () => {
    const res = analyze(sampleDs, baseQuery());
    const pvm = res.insights.pvmSummary;

    // Total delta equals volumeEffect + priceEffect + newEffect + lostEffect
    expect(pvm.volumeEffect + pvm.priceEffect + pvm.newEffect + pvm.lostEffect).toBeCloseTo(
      pvm.totalDeltaV,
      4,
    );
    expect(pvm.totalDeltaV).toBeCloseTo(res.totals.cyV - res.totals.pyV, 4);

    // Pure Volume + Mix equals total Volume Effect
    expect(pvm.pureVolumeEffect + pvm.mixEffect).toBeCloseTo(pvm.volumeEffect, 4);

    // Every insight level's PVM summary also satisfies additivity
    for (const lvl of INSIGHT_LEVELS.filter((l) => l !== 'distributor')) {
      const lPvm = res.insights.levelPvmSummary[lvl];
      expect(
        lPvm.volumeEffect + lPvm.priceEffect + lPvm.newEffect + lPvm.lostEffect,
      ).toBeCloseTo(lPvm.totalDeltaV, 4);
      expect(lPvm.pureVolumeEffect + lPvm.mixEffect).toBeCloseTo(lPvm.volumeEffect, 4);
    }

    // Direct unit tests for edge cases:
    // 1) Continuing business: PY=(100u, 1000 EGP -> 10 EGP/u), CY=(120u, 1500 EGP -> 12.5 EGP/u)
    // Vol effect = (120 - 100) * 10 = +200; Price effect = 120 * (12.5 - 10) = +300; Total = +500
    const cont = priceVolumeRow({ pyQ: 100, pyV: 1000, cyQ: 120, cyV: 1500 }, 1000);
    expect(cont.pyPrice).toBeCloseTo(10, 6);
    expect(cont.cyPrice).toBeCloseTo(12.5, 6);
    expect(cont.volumeEffect).toBeCloseTo(200, 6);
    expect(cont.priceEffect).toBeCloseTo(300, 6);
    expect(cont.newEffect).toBe(0);
    expect(cont.lostEffect).toBe(0);

    // 2) New item (PY=0, CY>0): entire delta in newEffect
    const newRow = priceVolumeRow({ pyQ: 0, pyV: 0, cyQ: 50, cyV: 750 }, 1000);
    expect(newRow.pyPrice).toBeNull();
    expect(newRow.cyPrice).toBeCloseTo(15, 6);
    expect(newRow.newEffect).toBeCloseTo(750, 6);
    expect(newRow.volumeEffect).toBe(0);
    expect(newRow.priceEffect).toBe(0);
    expect(newRow.lostEffect).toBe(0);

    // 3) Lost item (PY>0, CY=0): entire delta in lostEffect
    const lostRow = priceVolumeRow({ pyQ: 80, pyV: 800, cyQ: 0, cyV: 0 }, 1000);
    expect(lostRow.pyPrice).toBeCloseTo(10, 6);
    expect(lostRow.cyPrice).toBeNull();
    expect(lostRow.lostEffect).toBeCloseTo(-800, 6);
    expect(lostRow.volumeEffect).toBe(0);
    expect(lostRow.priceEffect).toBe(0);
    expect(lostRow.newEffect).toBe(0);

    // 4) Negative / returns-netted values
    const negRow = priceVolumeRow({ pyQ: 100, pyV: 1000, cyQ: -10, cyV: -120 }, 1000);
    expect(
      negRow.volumeEffect + negRow.priceEffect + negRow.newEffect + negRow.lostEffect,
    ).toBeCloseTo(negRow.totalDeltaV, 6);

    // 5) Empty selection (both 0)
    const emptySummary = decomposePriceVolume([]);
    expect(emptySummary.totalDeltaV).toBe(0);
    expect(emptySummary.volumeEffect).toBe(0);
    expect(emptySummary.priceEffect).toBe(0);
    expect(emptySummary.pureVolumeEffect).toBe(0);
    expect(emptySummary.mixEffect).toBe(0);

    // Price formatters
    expect(fmtPrice(12.5)).toBe('EGP 12.50');
    expect(fmtPrice(12.5, false)).toBe('12.50');
    expect(fmtPrice(null)).toBe('–');
    expect(fmtSignedPrice(2.5, false)).toBe('+2.50');
    expect(fmtSignedPrice(-2.5, false)).toBe('−2.50');
  });

  it('16. Item-to-Line reallocation uses latest CY period (Sep 202609 first) and removes unallocated PY-only items globally', () => {
    const reallocDs = datasetFromRows([
      // Item "Ampofer 100 mg 5 Amp": in Capital 1 in PY (202509), Capital 2 in 202607, and Capital 3 in 202609 (last period wins)
      {
        Date: 202509,
        Line: 'Capital 1',
        Brand: 'AMPOFER',
        Item: 'Ampofer 100 mg 5 Amp',
        MainType: 'Private',
        SubType: 'Private',
        Brick: 'Cairo 1',
        Territory: 'Cairo',
        Chain: null,
        CustomerID: 'C-1',
        CustomerName: 'Pharm 1',
        Distributor: 'Ibn Sina',
        TransactionType: 'Sales',
        Quantity: 100,
        Value: 10000,
      },
      {
        Date: 202607,
        Line: 'Capital 2',
        Brand: 'AMPOFER',
        Item: 'Ampofer 100 mg 5 Amp',
        MainType: 'Private',
        SubType: 'Private',
        Brick: 'Cairo 1',
        Territory: 'Cairo',
        Chain: null,
        CustomerID: 'C-1',
        CustomerName: 'Pharm 1',
        Distributor: 'Ibn Sina',
        TransactionType: 'Sales',
        Quantity: 40,
        Value: 4000,
      },
      {
        Date: 202609,
        Line: 'Capital 3',
        Brand: 'AMPOFER',
        Item: 'Ampofer 100 mg 5 Amp',
        MainType: 'Private',
        SubType: 'Private',
        Brick: 'Cairo 1',
        Territory: 'Cairo',
        Chain: null,
        CustomerID: 'C-1',
        CustomerName: 'Pharm 1',
        Distributor: 'Ibn Sina',
        TransactionType: 'Sales',
        Quantity: 110,
        Value: 11000,
      },
      // Item "PY Only Discontinued": present in PY (202509) only, not allocated to any Line in CY -> removed globally
      {
        Date: 202509,
        Line: 'Capital 1',
        Brand: 'OLD_BRAND',
        Item: 'PY Only Discontinued',
        MainType: 'Private',
        SubType: 'Private',
        Brick: 'Cairo 2',
        Territory: 'Cairo',
        Chain: null,
        CustomerID: 'C-2',
        CustomerName: 'Pharm 2',
        Distributor: 'Ibn Sina',
        TransactionType: 'Sales',
        Quantity: 999,
        Value: 99999,
      },
    ]);

    const meta = buildMeta(reallocDs);
    // Only Capital 3 exists in the effective structure; Capital 1, Capital 2, and PY Only Discontinued are excluded
    expect(meta.lines).toEqual(['Capital 3']);
    expect(brandOptions(meta, null)).toEqual(['AMPOFER']);
    expect(itemOptions(meta, null, [])).toEqual(['Ampofer 100 mg 5 Amp']);
    expect(itemOptions(meta, 'Capital 3', [])).toEqual(['Ampofer 100 mg 5 Amp']);

    const q = baseQuery({
      period: { cyYear: 2026, pyYear: 2025, quarter: 3, month: null, likeForLike: false },
    });
    const allRes = analyze(reallocDs, q);
    // PY includes only Ampofer (100u, 10000V), NOT PY Only Discontinued (999u, 99999V)
    expect(allRes.totals).toEqual({ pyQ: 100, pyV: 10000, cyQ: 150, cyV: 15000 });
    expect(allRes.lines).toEqual([
      { line: 'Capital 3', sums: { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 15000 } },
    ]);

    // Filtering by Capital 3 includes the reallocated PY and earlier CY rows of Ampofer
    const cap3Res = analyze(reallocDs, { ...q, line: 'Capital 3' });
    expect(cap3Res.totals).toEqual({ pyQ: 100, pyV: 10000, cyQ: 150, cyV: 15000 });
  });

  it('17. Guided cascading filters (Channel -> Market -> Product) narrow downstream options and filter totals without line selection', () => {
    const baseline = analyze(sampleDs, baseQuery());
    expect(baseline.filterOptions.mainTypes.length).toBeGreaterThan(0);
    expect(baseline.filterOptions.subTypes.length).toBeGreaterThan(0);
    expect(baseline.filterOptions.distributors.length).toBeGreaterThan(0);
    expect(baseline.filterOptions.territories.length).toBeGreaterThan(0);
    expect(baseline.filterOptions.brands.length).toBeGreaterThan(0);
    expect(baseline.filterOptions.items.length).toBeGreaterThan(0);

    const chosenMt = sampleMeta.mainTypes[0];
    const validSubs = subTypeOptions(sampleMeta, [chosenMt]);
    expect(validSubs.length).toBeGreaterThan(0);

    const step1 = analyze(sampleDs, baseQuery({ mainTypes: [chosenMt], subTypes: [validSubs[0]] }));
    expect(step1.totals.cyV).toBeLessThanOrEqual(baseline.totals.cyV);
    expect(step1.filterOptions.subTypes).toEqual(validSubs);
    expect(step1.filterOptions.distributors.length).toBeGreaterThan(0);

    const chosenDist = step1.filterOptions.distributors[0];
    const step2 = analyze(
      sampleDs,
      baseQuery({
        mainTypes: [chosenMt],
        subTypes: [validSubs[0]],
        distributors: [chosenDist],
      }),
    );
    expect(step2.totals.cyV).toBeLessThanOrEqual(step1.totals.cyV);
    expect(step2.filterOptions.territories.length).toBeGreaterThan(0);

    // Item drill chip works in separate DrillChips path
    const chosenItem = step2.filterOptions.items[0];
    const withItemDrill = analyze(
      sampleDs,
      baseQuery({
        drill: [{ field: 'Item', value: chosenItem, label: chosenItem }],
      }),
    );
    expect(withItemDrill.totals.cyV).toBeLessThan(baseline.totals.cyV);
  });

  it('18. WI-2: Sum of LevelTable row Contrib. pp over any full level equals portfolio YoY Growth %', () => {
    const res = analyze(sampleDs, baseQuery());
    for (const m of METRICS) {
      const kpi = deriveRow(res.totals, m);
      const expectedPct = kpi.growth.kind === 'pct' ? kpi.growth.value * 100 : 0;
      const totalPy = m === 'units' ? res.totals.pyQ : res.totals.pyV;

      for (const lvl of LEVELS.filter((l) => l !== 'distributor' && l !== 'chain')) {
        const rows = res.levels[lvl];
        const sumPp = rows.reduce((acc, r) => {
          const d = deriveRow(r.sums, m);
          return acc + (contributionPp(d.delta, totalPy) ?? 0);
        }, 0);
        expect(sumPp).toBeCloseTo(expectedPct, 6);
      }
    }
  });

  it('19. WI-1: Headline builder handles all 6 cases (growth, decline, flat, new-only, lost-only, empty)', () => {
    const period = { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' };
    const topPos = { label: 'Cairo', delta: 420000, pp: 4.2 };
    const topNeg = { label: 'Alex', delta: -180000, pp: -1.8 };

    // 1. Growth
    const hGrowth = buildHeadline(
      'value',
      { pyQ: 1000, pyV: 10_000_000, cyQ: 1200, cyV: 11_240_000 },
      topPos,
      topNeg,
      period,
    );
    expect(hGrowth.kind).toBe('growth');
    expect(hGrowth.text).toContain('Value grew +12.4%');
    expect(hGrowth.text).toContain('Top driver: Cairo (+4.20%)');
    expect(hGrowth.text).toContain('top detractor: Alex (−1.80%)');

    // 2. Decline
    const hDecline = buildHeadline(
      'value',
      { pyQ: 1000, pyV: 10_000_000, cyQ: 800, cyV: 8_500_000 },
      topPos,
      topNeg,
      period,
    );
    expect(hDecline.kind).toBe('decline');
    expect(hDecline.text).toContain('Value declined −15.0%');

    // 3. Flat
    const hFlat = buildHeadline(
      'value',
      { pyQ: 1000, pyV: 5_000_000, cyQ: 1000, cyV: 5_000_000 },
      topPos,
      topNeg,
      period,
    );
    expect(hFlat.kind).toBe('flat');
    expect(hFlat.text).toContain('held flat');

    // 4. New-only
    const hNew = buildHeadline(
      'value',
      { pyQ: 0, pyV: 0, cyQ: 500, cyV: 250_000 },
      { label: 'New Dist', delta: 250_000, pp: null },
      null,
      period,
    );
    expect(hNew.kind).toBe('new-only');
    expect(hNew.text).toContain('all-new business');
    expect(hNew.text).toContain('New Dist');

    // 5. Lost-only
    const hLost = buildHeadline(
      'value',
      { pyQ: 500, pyV: 250_000, cyQ: 0, cyV: 0 },
      null,
      { label: 'Lost Dist', delta: -250_000, pp: -100 },
      period,
    );
    expect(hLost.kind).toBe('lost-only');
    expect(hLost.text).toContain('−100.0%');
    expect(hLost.text).toContain('Lost Dist');

    // 6. Empty
    const hEmpty = buildHeadline(
      'units',
      { pyQ: 0, pyV: 0, cyQ: 0, cyV: 0 },
      null,
      null,
      period,
    );
    expect(hEmpty.kind).toBe('empty');
    expect(hEmpty.text).toContain('No units activity');
  });

  it('20. WI-1 & WI-3: Contribution waterfall satisfies exact PY + ΣΔ === CY across all driver levels, and concentration shares are in [0,1]', () => {
    const res = analyze(sampleDs, baseQuery());
    for (const m of METRICS) {
      const pyTotal = m === 'units' ? res.totals.pyQ : res.totals.pyV;
      const cyTotal = m === 'units' ? res.totals.cyQ : res.totals.cyV;

      for (const lvl of DRIVER_LEVELS) {
        const rows = res.insights.byLevel[lvl];
        const wf = buildWaterfall(rows, res.totals, m, res.period);
        expect(wf[0].kind).toBe('py');
        expect(wf[0].delta).toBeCloseTo(pyTotal, 5);
        expect(wf[wf.length - 1].kind).toBe('cy');
        expect(wf[wf.length - 1].delta).toBeCloseTo(cyTotal, 5);

        const stepDeltas = wf
          .filter((s) => s.kind !== 'py' && s.kind !== 'cy')
          .reduce((acc, s) => acc + s.delta, 0);
        expect(pyTotal + stepDeltas).toBeCloseTo(cyTotal, 5);

        const conc = growthConcentration(rows, m);
        if (conc.topPosShare1 !== null) {
          expect(conc.topPosShare1).toBeGreaterThanOrEqual(0);
          expect(conc.topPosShare1).toBeLessThanOrEqual(1 + 1e-9);
        }
        if (conc.topPosShare5 !== null) {
          expect(conc.topPosShare5).toBeGreaterThanOrEqual(conc.topPosShare1 ?? 0);
          expect(conc.topPosShare5).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }

    // Crafted concentration checks: single contributor -> share 1 & dominance true; symmetric -> 0.5 & dominance false
    const makeRow = (id: string, delta: number) => ({
      id,
      field: 'Territory' as const,
      value: id,
      label: id,
      sums: { pyQ: 100, pyV: 1000, cyQ: 100 + delta, cyV: 1000 + delta },
      unitsDelta: delta,
      valueDelta: delta,
      unitsGrowth: growth(100, 100 + delta),
      valueGrowth: growth(1000, 1000 + delta),
      unitsShareCy: 0.5,
      valueShareCy: 0.5,
      unitsContribPp: delta / 10,
      valueContribPp: delta / 10,
      pvm: priceVolumeRow({ pyQ: 100, pyV: 1000, cyQ: 100 + delta, cyV: 1000 + delta }, 1000),
    });

    const singleConc = growthConcentration([makeRow('OnlyOne', 500), makeRow('Loser', -100)], 'value');
    expect(singleConc.topPosShare1).toBeCloseTo(1, 6);
    expect(singleConc.topNegShare1).toBeCloseTo(1, 6);
    expect(singleConc.dominance).toBe(true);

    const symConc = growthConcentration([makeRow('A', 300), makeRow('B', 300)], 'value');
    expect(symConc.topPosShare1).toBeCloseTo(0.5, 6);
    expect(symConc.topPosShare5).toBeCloseTo(1.0, 6);
    expect(symConc.dominance).toBe(false);
  });

  it('21. WI-4: Customer segments partition the customer base and satisfy NRR, GRR, Churn, and NewRate identities', () => {
    const res = analyze(sampleDs, baseQuery());
    const custRows = res.levels.customer;
    expect(custRows.length).toBeGreaterThan(0);

    for (const m of METRICS) {
      const ci = res.customerInsights.byMetric[m];

      // 1. Segment counts sum to total customers with any activity; every customer in exactly one segment
      const sumSegCounts = CUSTOMER_SEGMENTS.reduce((acc, s) => acc + ci.segments[s].count, 0);
      expect(sumSegCounts).toBe(custRows.length);

      for (const r of custRows) {
        const matchedSegments = CUSTOMER_SEGMENTS.filter(
          (seg) => classifyCustomerSegment(r.sums, m) === seg,
        );
        expect(matchedSegments.length).toBe(1);
      }

      // 2. Identities: NRR + NewRate ≈ 1 + g; GRR <= NRR; GRR + ContractionRate + Churn ≈ 1
      const totalCells = deriveRow(sumRows(custRows), m);
      expect(totalCells.growth.kind).toBe('pct');
      const g = (totalCells.growth as { kind: 'pct'; value: number }).value;
      expect((ci.nrr ?? 0) + (ci.newRate ?? 0)).toBeCloseTo(1 + g, 6);
      expect(ci.grr!).toBeLessThanOrEqual(ci.nrr! + 1e-9);
      expect((ci.grr ?? 0) + (ci.contractionRate ?? 0) + (ci.churnRate ?? 0)).toBeCloseTo(1, 6);
    }

    // 3. Hand-computed fixture check on edge-cases.json:
    // In edge-cases.json (LFL on, Jul 2025 vs Jul 2026):
    // C-100: PY=5000, CY=9000 (retained, growing, expansion=+4000, contraction=0)
    // C-200: PY=0, CY=4000 (new)
    // C-300: PY=8000, CY=0 (lost)
    // C-400: PY=0, CY=0 (stable)
    // PY_active = 5000 + 8000 = 13000; Retained CY = 9000; New CY = 4000; Lost PY = 8000; Contraction = 0
    // Expected: NRR = 9000 / 13000; GRR = 5000 / 13000; Churn = 8000 / 13000; NewRate = 4000 / 13000
    // Notice Contraction = 0 here, so GRR + Churn = 5000/13000 + 8000/13000 = 1.0 literally!
    const edgeDs = datasetFromRows(edgeRows as Record<string, unknown>[]);
    const edgeMeta = buildMeta(edgeDs);
    const edgeRes = analyze(edgeDs, baseQuery({ period: defaultSelection(edgeMeta.availability) }));
    const eci = edgeRes.customerInsights;
    expect(eci.nrr).toBeCloseTo(9000 / 13000, 6);
    expect(eci.grr).toBeCloseTo(5000 / 13000, 6);
    expect(eci.churnRate).toBeCloseTo(8000 / 13000, 6);
    expect(eci.newRate).toBeCloseTo(4000 / 13000, 6);
    expect((eci.grr ?? 0) + (eci.churnRate ?? 0)).toBeCloseTo(1, 6);
    expect((eci.nrr ?? 0) + (eci.newRate ?? 0)).toBeCloseTo(1 + 0, 6); // total g = 0 (13000 -> 13000)

    // 4. Lost-only fixture and New-only fixture
    const lostOnlyCi = computeCustomerInsightsForMetric(
      [{ sums: { pyQ: 50, pyV: 5000, cyQ: 0, cyV: 0 } }],
      'value',
    );
    expect(lostOnlyCi.segments.lost.count).toBe(1);
    expect(lostOnlyCi.nrr).toBeCloseTo(0, 6);
    expect(lostOnlyCi.grr).toBeCloseTo(0, 6);
    expect(lostOnlyCi.churnRate).toBeCloseTo(1, 6);
    expect(lostOnlyCi.newRate).toBeCloseTo(0, 6);
    expect((lostOnlyCi.grr ?? 0) + (lostOnlyCi.churnRate ?? 0)).toBeCloseTo(1, 6);

    const newOnlyCi = computeCustomerInsightsForMetric(
      [{ sums: { pyQ: 0, pyV: 0, cyQ: 40, cyV: 4000 } }],
      'value',
    );
    expect(newOnlyCi.segments.new.count).toBe(1);
    expect(newOnlyCi.nrr).toBeNull();
    expect(newOnlyCi.grr).toBeNull();
    expect(newOnlyCi.churnRate).toBeNull();
    expect(newOnlyCi.newRate).toBeNull();
  });

  it('22. WI-5: Gross + Returns === Net for every group and total across Sales-only, Returns-only, and combined fixtures', () => {
    const resBoth = analyze(sampleDs, baseQuery());
    const resSalesOnly = analyze(sampleDs, baseQuery({ txTypes: ['Sales'] }));
    const resReturnsOnly = analyze(sampleDs, baseQuery({ txTypes: ['Return Sales'] }));

    for (const res of [resBoth, resSalesOnly, resReturnsOnly]) {
      const totRet = deriveReturnsSums(res.totals, res.grossTotals);
      expect(res.grossTotals.pyQ + totRet.pyQ).toBeCloseTo(res.totals.pyQ, 6);
      expect(res.grossTotals.pyV + totRet.pyV).toBeCloseTo(res.totals.pyV, 4);
      expect(res.grossTotals.cyQ + totRet.cyQ).toBeCloseTo(res.totals.cyQ, 6);
      expect(res.grossTotals.cyV + totRet.cyV).toBeCloseTo(res.totals.cyV, 4);

      for (const lvl of LEVELS) {
        for (const r of res.levels[lvl]) {
          expect(r.gross).toBeDefined();
          const ret = deriveReturnsSums(r.sums, r.gross!);
          expect(r.gross!.pyQ + ret.pyQ).toBeCloseTo(r.sums.pyQ, 6);
          expect(r.gross!.pyV + ret.pyV).toBeCloseTo(r.sums.pyV, 4);
          expect(r.gross!.cyQ + ret.cyQ).toBeCloseTo(r.sums.cyQ, 6);
          expect(r.gross!.cyV + ret.cyV).toBeCloseTo(r.sums.cyV, 4);
        }
      }
    }

    // In Sales-only, gross === net (returns = 0)
    expect(resSalesOnly.grossTotals.cyV).toBeCloseTo(resSalesOnly.totals.cyV, 4);
    // In Returns-only, gross === 0
    expect(resReturnsOnly.grossTotals.cyV).toBe(0);

    // Hand-computed portfolio returns rate & flag check:
    // Suppose Gross = 50,000 EGP, Return Sales = -2,500 EGP -> Net = 47,500 EGP -> Returns Rate = 2500 / 50000 * 100 = 5.0%
    expect(returnsRatePct(47500, 50000)).toBeCloseTo(5.0, 6);
    // Flagged when row rate > 1.5 * portfolio rate (e.g. > 7.5%) AND gross >= 10,000 EGP
    expect(isReturnsFlagged(18000, 20000, 5.0)).toBe(true); // 10% > 7.5% and gross 20,000 >= 10,000
    expect(isReturnsFlagged(4500, 5000, 5.0)).toBe(false); // 10% > 7.5% but gross 5,000 < 10,000 floor
  });

  it('23. WI-6: Sum of Territory × Month pp-mode cells over all territories and months equals portfolio YoY %', () => {
    const res = analyze(sampleDs, baseQuery());
    for (const m of METRICS) {
      const totalPy = m === 'units' ? res.totals.pyQ : res.totals.pyV;
      const kpi = deriveRow(res.totals, m);
      const expectedPp = kpi.growth.kind === 'pct' ? kpi.growth.value * 100 : 0;

      let sumCellPp = 0;
      for (const tm of res.territoryMonths) {
        for (const mo of tm.months) {
          const cells = metricCells(mo.sums, m);
          sumCellPp += contributionPp(cells.delta, totalPy) ?? 0;
        }
      }
      expect(sumCellPp).toBeCloseTo(expectedPp, 6);
    }
  });
});
