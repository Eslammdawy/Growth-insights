import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  ExportableRowItem,
  exportAllLevelsToExcel,
  exportDefectorWatchlistToExcel,
  exportLevelTableToExcel,
  exportProductExposureToExcel,
} from './exportExcel';
import { GroupRow, Level, TABLE_LEVELS } from './aggregate';
import { DerivedRow, buildProductSegmentBreakdown, decomposeCustomerBehavior, emptySums } from './metrics';

describe('exportLevelTableToExcel', () => {
  it('generates a valid Excel file for customer level table with unexpanded rows', () => {
    const appendSheetSpy = vi.spyOn(XLSX.utils, 'book_append_sheet');

    const total: DerivedRow = {
      py: 100000,
      cy: 150000,
      delta: 50000,
      growth: { kind: 'pct', value: 0.5 },
      growthNum: 0.5,
      status: 'growing',
    };

    const rows: ExportableRowItem[] = [
      {
        kind: 'row',
        row: {
          id: 'cust-1',
          field: 'CustomerID',
          value: 'cust-1',
          label: 'Customer Alpha',
          customerId: 'C001',
          brick: 'Downtown',
          subType: 'Chain',
          sums: { pyQ: 100, pyV: 60000, cyQ: 120, cyV: 90000 },
          rowCount: 5,
        },
        d: {
          py: 60000,
          cy: 90000,
          delta: 30000,
          growth: { kind: 'pct', value: 0.5 },
          growthNum: 0.5,
          status: 'growing',
        },
        depth: 0,
      },
      {
        kind: 'row',
        row: {
          id: 'cust-2',
          field: 'CustomerID',
          value: 'cust-2',
          label: 'Customer Beta',
          customerId: 'C002',
          brick: 'Giza',
          subType: 'Community',
          sums: { pyQ: 80, pyV: 40000, cyQ: 90, cyV: 60000 },
          rowCount: 3,
        },
        d: {
          py: 40000,
          cy: 60000,
          delta: 20000,
          growth: { kind: 'pct', value: 0.5 },
          growthNum: 0.5,
          status: 'growing',
        },
        depth: 0,
      },
    ];

    try {
      exportLevelTableToExcel({
        level: 'customer',
        label: 'Customer',
        rows,
        total,
        totalCount: 2,
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'value',
      });

      expect(appendSheetSpy).toHaveBeenCalled();
      const [, ws, sheetName] = appendSheetSpy.mock.calls[appendSheetSpy.mock.calls.length - 1];
      expect(sheetName).toBe('Customer Level');

      // Verify sheet data
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number)[][];
      expect(data[0]).toEqual([
        'Customer ID',
        'Customer Name',
        'Brick (CY)',
        'SubType',
        'PY (Q3-2025) [EGP]',
        'CY (Q3-2026) [EGP]',
        'YoY Growth [EGP]',
        'YoY Growth %',
        'Contrib. %',
        'Status',
      ]);
      expect(data[1][0]).toBe('C001');
      expect(data[1][1]).toBe('Customer Alpha');
      expect(data[1][8]).toBeCloseTo(30, 5);
      expect(data[2][0]).toBe('C002');
      expect(data[2][1]).toBe('Customer Beta');
      expect(data[2][8]).toBeCloseTo(20, 5);
      // Total row
      const totalRow = data[3];
      expect(totalRow[1]).toBe('Total (2 customers)');
      expect(totalRow[4]).toBe(100000);
      expect(totalRow[5]).toBe(150000);
      expect(totalRow[6]).toBe(50000);
      expect(totalRow[7]).toBe(0.5);
      expect(totalRow[8]).toBeCloseTo(50, 5);
      expect(totalRow[9]).toBe('Growing');
    } finally {
      appendSheetSpy.mockRestore();
    }
  });

  it('generates a valid Excel file for subtype level table with expanded items and chains', () => {
    const appendSheetSpy = vi.spyOn(XLSX.utils, 'book_append_sheet');

    const total: DerivedRow = {
      py: 50000,
      cy: 60000,
      delta: 10000,
      growth: { kind: 'pct', value: 0.2 },
      growthNum: 0.2,
      status: 'growing',
    };

    const rows: ExportableRowItem[] = [
      {
        kind: 'row',
        row: {
          id: 'sub-chain',
          field: 'SubType',
          value: 'Chain',
          label: 'Chain',
          sums: { pyQ: 50, pyV: 50000, cyQ: 60, cyV: 60000 },
          rowCount: 2,
        },
        d: {
          py: 50000,
          cy: 60000,
          delta: 10000,
          growth: { kind: 'pct', value: 0.2 },
          growthNum: 0.2,
          status: 'growing',
        },
        depth: 0,
      },
      {
        kind: 'chain',
        row: {
          id: 'sub-chain-ezaby',
          field: 'Chain',
          value: 'Ezaby',
          label: 'Ezaby',
          parentValue: 'Chain',
          sums: { pyQ: 30, pyV: 30000, cyQ: 40, cyV: 40000 },
          rowCount: 1,
        },
        d: {
          py: 30000,
          cy: 40000,
          delta: 10000,
          growth: { kind: 'pct', value: 0.3333 },
          growthNum: 0.3333,
          status: 'growing',
        },
        depth: 1,
      },
      {
        kind: 'item',
        row: {
          id: 'item-panadol',
          field: 'Item',
          value: 'Panadol Extra',
          label: 'Panadol Extra',
          brand: 'Panadol',
          sums: { pyQ: 30, pyV: 30000, cyQ: 40, cyV: 40000 },
          rowCount: 1,
        },
        d: {
          py: 30000,
          cy: 40000,
          delta: 10000,
          growth: { kind: 'pct', value: 0.3333 },
          growthNum: 0.3333,
          status: 'growing',
        },
        depth: 2,
      },
    ];

    try {
      exportLevelTableToExcel({
        level: 'subtype',
        label: 'SubType',
        rows,
        total,
        totalCount: 1,
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'units',
      });

      expect(appendSheetSpy).toHaveBeenCalled();
      const [, ws, sheetName] = appendSheetSpy.mock.calls[appendSheetSpy.mock.calls.length - 1];
      expect(sheetName).toBe('SubType Level');

      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number)[][];
      expect(data[0]).toEqual([
        'SubType / Item',
        'Type',
        'Brand',
        'PY (Q3-2025) [Units]',
        'CY (Q3-2026) [Units]',
        'YoY Growth [Units]',
        'YoY Growth %',
        'Contrib. %',
        'Status',
      ]);
      expect(data[1][0]).toBe('Chain');
      expect(data[1][1]).toBe('SubType');
      expect(data[2][0]).toBe('  [Chain] Ezaby');
      expect(data[2][1]).toBe('Chain');
      expect(data[3][0]).toBe('    Panadol Extra');
      expect(data[3][1]).toBe('Item');
      expect(data[3][2]).toBe('Panadol');
    } finally {
      appendSheetSpy.mockRestore();
    }
  });

  it('includes Gross, Returns, and Returns % columns when showReturns is enabled (WI-5) and exports Defector Watchlist (WI-4)', () => {
    const appendSheetSpy = vi.spyOn(XLSX.utils, 'book_append_sheet');
    try {
      const total: DerivedRow = {
        py: 100000,
        cy: 90000,
        delta: -10000,
        growth: { kind: 'pct', value: -0.1 },
        growthNum: -0.1,
        status: 'declining',
      };
      exportLevelTableToExcel({
        level: 'territory',
        label: 'Territory',
        rows: [
          {
            kind: 'row',
            row: {
              id: 'terr-cairo',
              field: 'Territory',
              value: 'Cairo',
              label: 'Cairo',
              sums: { pyQ: 100, pyV: 100000, cyQ: 90, cyV: 90000 },
              gross: { pyQ: 100, pyV: 100000, cyQ: 100, cyV: 100000 },
              rowCount: 2,
            },
            d: total,
            depth: 0,
          },
        ],
        total,
        totalCount: 1,
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'value',
        showReturns: true,
        tableGrossTotals: { pyQ: 100, pyV: 100000, cyQ: 100, cyV: 100000 },
      });

      const [, wsReturns] = appendSheetSpy.mock.calls[appendSheetSpy.mock.calls.length - 1];
      const dataReturns = XLSX.utils.sheet_to_json(wsReturns, { header: 1 }) as (string | number)[][];
      expect(dataReturns[0]).toContain('CY Gross [EGP]');
      expect(dataReturns[0]).toContain('CY Returns [EGP]');
      expect(dataReturns[0]).toContain('Returns %');

      // Watchlist export
      exportDefectorWatchlistToExcel({
        customers: [
          {
            row: {
              id: 'cust-lost',
              field: 'CustomerID',
              value: 'C-300',
              label: 'Lost Pharmacy',
              customerId: 'C-300',
              brick: 'Alex',
              subType: 'Private',
              sums: { pyQ: 80, pyV: 80000, cyQ: 0, cyV: 0 },
              rowCount: 1,
            },
            pyVal: 80000,
            contribPp: -8.0,
            items: [
              {
                id: 'item-1',
                field: 'Item',
                value: 'Item A',
                label: 'Item A',
                brand: 'Brand A',
                sums: { pyQ: 80, pyV: 80000, cyQ: 0, cyV: 0 },
                rowCount: 1,
              },
            ],
          },
        ],
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'value',
      });

      const [, wsWatch, sheetWatch] = appendSheetSpy.mock.calls[appendSheetSpy.mock.calls.length - 1];
      expect(sheetWatch).toBe('Defector Watchlist');
      const dataWatch = XLSX.utils.sheet_to_json(wsWatch, { header: 1 }) as (string | number)[][];
      expect(dataWatch[0]).toEqual([
        'Customer ID',
        'Customer Name / Item',
        'Brick (CY)',
        'SubType',
        'Type',
        'Brand',
        'PY Lost (Q3-2025) [EGP]',
        'Contrib. %',
      ]);
      expect(dataWatch[1][1]).toBe('Lost Pharmacy');
      expect(dataWatch[2][1]).toBe('  Item A');
    } finally {
      appendSheetSpy.mockRestore();
    }
  });

  it('exports Product × Customer-Segment Exposure Matrix and Customer-Behavior Decomposition to Excel', () => {
    const appendSheetSpy = vi.spyOn(XLSX.utils, 'book_append_sheet');
    try {
      const cb = decomposeCustomerBehavior(
        [
          { pyQ: 0, pyV: 0, cyQ: 10, cyV: 10000 },
          { pyQ: 50, pyV: 50000, cyQ: 70, cyV: 70000 },
          { pyQ: 40, pyV: 40000, cyQ: 30, cyV: 30000 },
          { pyQ: 20, pyV: 20000, cyQ: 0, cyV: 0 },
        ],
        110000,
        'value',
      );
      const row = buildProductSegmentBreakdown({
        itemId: 'Item:Panadol',
        itemLabel: 'Panadol',
        level: 'item',
        brand: 'Panadol Brand',
        line: 'Line 1',
        segments: {
          new: { pyQ: 0, pyV: 0, cyQ: 10, cyV: 10000 },
          growing: { pyQ: 50, pyV: 50000, cyQ: 70, cyV: 70000 },
          stable: emptySums(),
          declining: { pyQ: 40, pyV: 40000, cyQ: 30, cyV: 30000 },
          lost: { pyQ: 20, pyV: 20000, cyQ: 0, cyV: 0 },
        },
        totals: { pyQ: 110, pyV: 110000, cyQ: 110, cyV: 110000 },
        customerBehavior: cb,
        metric: 'value',
      });

      exportProductExposureToExcel({
        rows: [row],
        level: 'item',
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'value',
      });

      const [, wsExp, sheetExp] = appendSheetSpy.mock.calls[appendSheetSpy.mock.calls.length - 1];
      expect(sheetExp).toBe('Item Exposure');
      const dataExp = XLSX.utils.sheet_to_json(wsExp, { header: 1 }) as (string | number)[][];
      expect(dataExp[0]).toContain('Item');
      expect(dataExp[0]).toContain('Brand');
      expect(dataExp[0]).toContain('Line');
      expect(dataExp[0]).toContain('Lost Seg pp');
      expect(dataExp[0]).toContain('+New Cust Effect [EGP]');
      expect(dataExp[1][0]).toBe('Panadol');
      expect(dataExp[1][1]).toBe('Panadol Brand');
      expect(dataExp[1][2]).toBe('Line 1');
      expect(dataExp[1][3]).toBe(110000);
      expect(dataExp[1][4]).toBe(110000);
      expect(dataExp[1][5]).toBe(0);
    } finally {
      appendSheetSpy.mockRestore();
    }
  });

  it('exports all 5 dashboard levels in separate tabs with hierarchical per-product rows, side-by-side Units & EGP, and optional Returns', () => {
    const appendSheetSpy = vi.spyOn(XLSX.utils, 'book_append_sheet');
    try {
      const makeRow = (
        id: string,
        field: GroupRow['field'],
        label: string,
        sums: GroupRow['sums'],
        gross?: GroupRow['gross'],
        extra: Partial<GroupRow> = {},
      ): GroupRow => ({
        id,
        field,
        value: extra.value ?? label,
        label,
        sums,
        gross,
        rowCount: 1,
        ...extra,
      });

      const levelsData: Record<Level, GroupRow[]> = {
        subtype: [
          makeRow(
            'SubType:Private',
            'SubType',
            'Private',
            { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 18000 },
            { pyQ: 100, pyV: 10000, cyQ: 160, cyV: 20000 },
          ),
        ],
        distributor: [
          makeRow('Distributor:Ibn Sina', 'Distributor', 'Ibn Sina', { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 18000 }),
        ],
        chain: [
          makeRow('Chain:Seif', 'Chain', 'Seif', { pyQ: 40, pyV: 4000, cyQ: 60, cyV: 7000 }),
        ],
        territory: [
          makeRow('Territory:Cairo', 'Territory', 'Cairo', { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 18000 }),
        ],
        brick: [],
        customer: [
          makeRow(
            'CustomerID:C001|Alpha Pharm',
            'CustomerID',
            'Alpha Pharm',
            { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 18000 },
            { pyQ: 100, pyV: 10000, cyQ: 160, cyV: 20000 },
            { value: 'C001|Alpha Pharm', customerId: 'C001', brick: 'Downtown', subType: 'Private' },
          ),
        ],
      };

      const itemsByLevel: Record<Level, Record<string, GroupRow[]>> = {
        subtype: {
          'SubType:Private': [
            makeRow('SubType:Private|Item:Item B', 'Item', 'Item B', { pyQ: 20, pyV: 2000, cyQ: 40, cyV: 6000 }, undefined, {
              brand: 'Brand B',
            }),
            makeRow(
              'SubType:Private|Item:Item A',
              'Item',
              'Item A',
              { pyQ: 80, pyV: 8000, cyQ: 110, cyV: 12000 },
              { pyQ: 80, pyV: 8000, cyQ: 120, cyV: 14000 },
              { brand: 'Brand A' },
            ),
          ],
        },
        distributor: {
          'Distributor:Ibn Sina': [
            makeRow('Distributor:Ibn Sina|Item:Item A', 'Item', 'Item A', { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 18000 }, undefined, {
              brand: 'Brand A',
            }),
          ],
        },
        chain: {
          'Chain:Seif': [
            makeRow('Chain:Seif|Item:Item A', 'Item', 'Item A', { pyQ: 40, pyV: 4000, cyQ: 60, cyV: 7000 }, undefined, {
              brand: 'Brand A',
            }),
          ],
        },
        territory: {
          'Territory:Cairo': [
            makeRow('Territory:Cairo|Item:Item A', 'Item', 'Item A', { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 18000 }, undefined, {
              brand: 'Brand A',
            }),
          ],
        },
        brick: {},
        customer: {
          'CustomerID:C001|Alpha Pharm': [
            makeRow(
              'CustomerID:C001|Alpha Pharm|Item:Item A',
              'Item',
              'Item A',
              { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 18000 },
              { pyQ: 100, pyV: 10000, cyQ: 160, cyV: 20000 },
              { brand: 'Brand A' },
            ),
          ],
        },
      };

      // 1. Without Returns columns
      exportAllLevelsToExcel({
        levels: TABLE_LEVELS,
        levelsData,
        itemsByLevel,
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'value',
        portfolioTotals: { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 18000 },
        showReturns: false,
      });

      const calls = appendSheetSpy.mock.calls.slice(-5);
      expect(calls.map((c) => c[2])).toEqual([
        'SubType Level',
        'Distributor Level',
        'Chains Level',
        'Territory Level',
        'Customer Level',
      ]);
      // All 5 sheets belong to the same workbook instance
      const wbRef = calls[0][0];
      for (const c of calls) expect(c[0]).toBe(wbRef);

      // SubType sheet verification: parent + 2 items sorted by EGP delta desc (Item A +4000 tie-break before Item B +4000) + Total
      const subData = XLSX.utils.sheet_to_json(calls[0][1], { header: 1 }) as (string | number)[][];
      expect(subData[0]).toEqual([
        'SubType / Item',
        'Type',
        'Brand',
        'PY (Q3-2025) [Units]',
        'CY (Q3-2026) [Units]',
        'YoY Growth [Units]',
        'YoY Growth % [Units]',
        'Contrib. % [Units]',
        'PY (Q3-2025) [EGP]',
        'CY (Q3-2026) [EGP]',
        'YoY Growth [EGP]',
        'YoY Growth % [EGP]',
        'Contrib. % [EGP]',
        'Status',
      ]);
      expect(subData[1][0]).toBe('Private');
      expect(subData[1][1]).toBe('SubType');
      expect(subData[1][3]).toBe(100); // PY Units
      expect(subData[1][4]).toBe(150); // CY Units
      expect(subData[1][5]).toBe(50); // Delta Units
      expect(subData[1][6]).toBeCloseTo(0.5, 5); // Growth % Units
      expect(subData[1][7]).toBeCloseTo(50, 5); // Contrib % Units
      expect(subData[1][8]).toBe(10000); // PY EGP
      expect(subData[1][9]).toBe(18000); // CY EGP
      expect(subData[1][10]).toBe(8000); // Delta EGP
      expect(subData[1][11]).toBeCloseTo(0.8, 5); // Growth % EGP
      expect(subData[1][12]).toBeCloseTo(80, 5); // Contrib % EGP
      expect(subData[1][13]).toBe('Growing');

      // Child Item rows indented and sorted by label on tie
      expect(subData[2][0]).toBe('  Item A');
      expect(subData[2][1]).toBe('Item');
      expect(subData[2][2]).toBe('Brand A');
      expect(subData[3][0]).toBe('  Item B');
      expect(subData[3][1]).toBe('Item');
      expect(subData[3][2]).toBe('Brand B');
      expect(subData[4][0]).toBe('Total (1 subtypes)');
      expect(subData[4][1]).toBe('Total');

      // Customer sheet verification
      const custData = XLSX.utils.sheet_to_json(calls[4][1], { header: 1 }) as (string | number)[][];
      expect(custData[0].slice(0, 6)).toEqual([
        'Customer ID',
        'Customer Name / Item',
        'Brick (CY)',
        'SubType',
        'Type',
        'Brand',
      ]);
      expect(custData[1].slice(0, 6)).toEqual(['C001', 'Alpha Pharm', 'Downtown', 'Private', 'Customer', '']);
      expect(custData[2].slice(0, 6)).toEqual(['', '  Item A', '', '', 'Item', 'Brand A']);
      expect(custData[3].slice(0, 6)).toEqual(['', 'Total (1 customers)', '', '', 'Total', '']);

      // 2. With showReturns: true
      exportAllLevelsToExcel({
        levels: TABLE_LEVELS,
        levelsData,
        itemsByLevel,
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'value',
        portfolioTotals: { pyQ: 100, pyV: 10000, cyQ: 150, cyV: 18000 },
        portfolioGrossTotals: { pyQ: 100, pyV: 10000, cyQ: 160, cyV: 20000 },
        showReturns: true,
      });

      const retCalls = appendSheetSpy.mock.calls.slice(-5);
      const subRetData = XLSX.utils.sheet_to_json(retCalls[0][1], { header: 1 }) as (string | number)[][];
      expect(subRetData[0].slice(13)).toEqual([
        'CY Gross [Units]',
        'CY Returns [Units]',
        'CY Gross [EGP]',
        'CY Returns [EGP]',
        'Returns %',
        'Status',
      ]);
      expect(subRetData[1].slice(13)).toEqual([160, -10, 20000, -2000, 0.1, 'Growing']);
    } finally {
      appendSheetSpy.mockRestore();
    }
  });
});
