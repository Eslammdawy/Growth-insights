import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import {
  exportAllLevelsToExcel,
  exportDefectorWatchlistToExcel,
  exportLevelTableToExcel,
  exportProductExposureToExcel,
  freezeHeaderRow,
} from './exportExcel';
import { GroupRow, Level, TABLE_LEVELS } from './aggregate';
import { buildProductSegmentBreakdown, decomposeCustomerBehavior, emptySums } from './metrics';

describe('exportLevelTableToExcel', () => {
  const custRow = (id: string, cid: string, label: string, brick: string, subType: string, sums: GroupRow['sums']): GroupRow => ({
    id,
    field: 'CustomerID',
    value: id,
    label,
    customerId: cid,
    brick,
    subType,
    sums,
    rowCount: 1,
  });
  const itemRow = (id: string, label: string, brand: string, sums: GroupRow['sums'], gross?: GroupRow['sums']): GroupRow => ({
    id,
    field: 'Item',
    value: label,
    label,
    brand,
    sums,
    gross,
    rowCount: 1,
  });

  it('exports the customer level as a flat table: customer columns repeated on every item row, no Type / Total rows', () => {
    const appendSheetSpy = vi.spyOn(XLSX.utils, 'book_append_sheet');
    try {
      const rows = [
        custRow('cust-1', 'C001', 'Customer Alpha', 'Downtown', 'Chain', { pyQ: 100, pyV: 60000, cyQ: 120, cyV: 90000 }),
        custRow('cust-2', 'C002', 'Customer Beta', 'Giza', 'Community', { pyQ: 80, pyV: 40000, cyQ: 90, cyV: 60000 }),
      ];
      const itemsByRow: Record<string, GroupRow[]> = {
        'cust-1': [
          itemRow('cust-1|A', 'Item A', 'Brand A', { pyQ: 50, pyV: 30000, cyQ: 50, cyV: 35000 }),
          itemRow('cust-1|B', 'Item B', 'Brand B', { pyQ: 50, pyV: 30000, cyQ: 70, cyV: 55000 }),
        ],
        // cust-2 has no item breakdown â†’ emitted once with blank Item / Brand
      };

      exportLevelTableToExcel({
        level: 'customer',
        label: 'Customer',
        rows,
        itemsByRow,
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'value',
        portfolioTotals: { pyQ: 180, pyV: 100000, cyQ: 210, cyV: 150000 },
      });

      const [, ws, sheetName] = appendSheetSpy.mock.calls[appendSheetSpy.mock.calls.length - 1];
      expect(sheetName).toBe('Customer Level');
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as (string | number)[][];
      expect(data[0]).toEqual([
        'Customer ID',
        'Customer Name',
        'Brick (CY)',
        'SubType',
        'Item',
        'Brand',
        'PY (Q3-2025) [EGP]',
        'CY (Q3-2026) [EGP]',
        'YoY Growth [EGP]',
        'YoY Growth %',
        'Contrib. %',
        'Status',
      ]);
      // Items sorted by Î” desc within the customer (Item B +25000 before Item A +5000)
      expect(data[1].slice(0, 6)).toEqual(['C001', 'Customer Alpha', 'Downtown', 'Chain', 'Item B', 'Brand B']);
      expect(data[1][8]).toBe(25000);
      expect(data[1][10]).toBeCloseTo(25, 5);
      expect(data[2].slice(0, 6)).toEqual(['C001', 'Customer Alpha', 'Downtown', 'Chain', 'Item A', 'Brand A']);
      expect(data[3].slice(0, 6)).toEqual(['C002', 'Customer Beta', 'Giza', 'Community', '', '']);
      expect(data[3][8]).toBe(20000);
      expect(data).toHaveLength(4); // header + 3 data rows, no Total row
      expect(ws['!autofilter']).toEqual({ ref: 'A1:L4' });
    } finally {
      appendSheetSpy.mockRestore();
    }
  });

  it('exports the subtype level as a flat table (SubType | Item | Brand), ignoring the chain breakdown', () => {
    const appendSheetSpy = vi.spyOn(XLSX.utils, 'book_append_sheet');
    try {
      const parent: GroupRow = {
        id: 'SubType:Chain',
        field: 'SubType',
        value: 'Chain',
        label: 'Chain',
        sums: { pyQ: 50, pyV: 50000, cyQ: 60, cyV: 60000 },
        rowCount: 2,
        children: [
          {
            id: 'SubType:Chain|Chain:Ezaby',
            field: 'Chain',
            value: 'Ezaby',
            label: 'Ezaby',
            parentValue: 'Chain',
            sums: { pyQ: 50, pyV: 50000, cyQ: 60, cyV: 60000 },
            rowCount: 1,
          },
        ],
      };
      exportLevelTableToExcel({
        level: 'subtype',
        label: 'SubType',
        rows: [parent],
        itemsByRow: {
          'SubType:Chain': [itemRow('i1', 'Panadol Extra', 'Panadol', { pyQ: 50, pyV: 50000, cyQ: 60, cyV: 60000 })],
        },
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'units',
      });

      const [, ws, sheetName] = appendSheetSpy.mock.calls[appendSheetSpy.mock.calls.length - 1];
      expect(sheetName).toBe('SubType Level');
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number)[][];
      expect(data[0]).toEqual([
        'SubType',
        'Item',
        'Brand',
        'PY (Q3-2025) [Units]',
        'CY (Q3-2026) [Units]',
        'YoY Growth [Units]',
        'YoY Growth %',
        'Contrib. %',
        'Status',
      ]);
      expect(data.slice(1)).toEqual([['Chain', 'Panadol Extra', 'Panadol', 50, 60, 10, 0.2, 20, 'Growing']]);
    } finally {
      appendSheetSpy.mockRestore();
    }
  });

  it('freezeHeaderRow injects a frozen top-row pane into every worksheet', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a'], [1]]), 'One');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['b'], [2]]), 'Two');
    const raw = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    const patched = freezeHeaderRow(raw);
    const files = unzipSync(patched);
    for (const p of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      expect(strFromU8(files[p])).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    }
    // Still a readable workbook
    const back = XLSX.read(patched, { type: 'array' });
    expect(back.SheetNames).toEqual(['One', 'Two']);
  });

  it('includes Gross, Returns, and Returns % columns when showReturns is enabled (WI-5) and exports Defector Watchlist (WI-4)', () => {
    const appendSheetSpy = vi.spyOn(XLSX.utils, 'book_append_sheet');
    try {
      exportLevelTableToExcel({
        level: 'territory',
        label: 'Territory',
        rows: [
          {
            id: 'terr-cairo',
            field: 'Territory',
            value: 'Cairo',
            label: 'Cairo',
            sums: { pyQ: 100, pyV: 100000, cyQ: 90, cyV: 90000 },
            gross: { pyQ: 100, pyV: 100000, cyQ: 100, cyV: 100000 },
            rowCount: 2,
          },
        ],
        itemsByRow: {
          'terr-cairo': [
            itemRow('terr-cairo|X', 'Item X', 'Brand X', { pyQ: 100, pyV: 100000, cyQ: 90, cyV: 90000 }, {
              pyQ: 100,
              pyV: 100000,
              cyQ: 100,
              cyV: 100000,
            }),
          ],
        },
        period: { pyLabel: 'Q3-2025', cyLabel: 'Q3-2026' },
        metric: 'value',
        showReturns: true,
      });

      const [, wsReturns] = appendSheetSpy.mock.calls[appendSheetSpy.mock.calls.length - 1];
      const dataReturns = XLSX.utils.sheet_to_json(wsReturns, { header: 1 }) as (string | number)[][];
      expect(dataReturns[1]).toEqual(['Cairo', 'Item X', 'Brand X', 100000, 90000, -10000, -0.1, -10, 100000, -10000, 0.1, 'Declining']);
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

  it('exports Product Ã— Customer-Segment Exposure Matrix and Customer-Behavior Decomposition to Excel', () => {
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

  it('exports all 4 dashboard levels in separate tabs as flat level × item tables, side-by-side Units & EGP, and optional Returns', () => {
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

      const calls = appendSheetSpy.mock.calls.slice(-4);
      expect(calls.map((c) => c[2])).toEqual([
        'SubType Level',
        'Chains Level',
        'Territory Level',
        'Customer Level',
      ]);
      // All 4 sheets belong to the same workbook instance
      const wbRef = calls[0][0];
      for (const c of calls) expect(c[0]).toBe(wbRef);

      // SubType sheet: flat rows only (SubType | Item | Brand), items sorted by EGP Δ desc with label tie-break, no parent / Total rows
      const subData = XLSX.utils.sheet_to_json(calls[0][1], { header: 1 }) as (string | number)[][];
      expect(subData[0]).toEqual([
        'SubType',
        'Item',
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
      expect(subData).toHaveLength(3);
      expect(subData[1].slice(0, 3)).toEqual(['Private', 'Item A', 'Brand A']);
      expect(subData[1][3]).toBe(80); // PY Units
      expect(subData[1][4]).toBe(110); // CY Units
      expect(subData[1][5]).toBe(30); // Delta Units
      expect(subData[1][6]).toBeCloseTo(0.375, 5); // Growth % Units
      expect(subData[1][7]).toBeCloseTo(30, 5); // Contrib % Units
      expect(subData[1][8]).toBe(8000); // PY EGP
      expect(subData[1][9]).toBe(12000); // CY EGP
      expect(subData[1][10]).toBe(4000); // Delta EGP
      expect(subData[1][11]).toBeCloseTo(0.5, 5); // Growth % EGP
      expect(subData[1][12]).toBeCloseTo(40, 5); // Contrib % EGP
      expect(subData[1][13]).toBe('Growing');
      expect(subData[2].slice(0, 3)).toEqual(['Private', 'Item B', 'Brand B']);

      // Chains sheet header
      const chainData = XLSX.utils.sheet_to_json(calls[1][1], { header: 1 }) as (string | number)[][];
      expect(chainData[0].slice(0, 3)).toEqual(['Chains', 'Item', 'Brand']);
      expect(chainData[1].slice(0, 3)).toEqual(['Seif', 'Item A', 'Brand A']);

      // Customer sheet: customer columns repeated on the item row
      const custData = XLSX.utils.sheet_to_json(calls[3][1], { header: 1 }) as (string | number)[][];
      expect(custData[0].slice(0, 6)).toEqual(['Customer ID', 'Customer Name', 'Brick (CY)', 'SubType', 'Item', 'Brand']);
      expect(custData[1].slice(0, 6)).toEqual(['C001', 'Alpha Pharm', 'Downtown', 'Private', 'Item A', 'Brand A']);
      expect(custData).toHaveLength(2);
      expect(calls[3][1]['!autofilter']).toBeDefined();

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

      const retCalls = appendSheetSpy.mock.calls.slice(-4);
      const subRetData = XLSX.utils.sheet_to_json(retCalls[0][1], { header: 1 }) as (string | number)[][];
      expect(subRetData[0].slice(13)).toEqual([
        'CY Gross [Units]',
        'CY Returns [Units]',
        'CY Gross [EGP]',
        'CY Returns [EGP]',
        'Returns %',
        'Status',
      ]);
      // Item A row (Private Ã— Item A): gross CY 120 u / 14000 EGP vs net 110 u / 12000 EGP
      expect(subRetData[1].slice(13, 17)).toEqual([120, -10, 14000, -2000]);
      expect(subRetData[1][17]).toBeCloseTo(2000 / 14000, 5);
      expect(subRetData[1][18]).toBe('Growing');
      // Item B has no gross breakdown â†’ gross falls back to net, Returns % 'â€“'
      expect(subRetData[2].slice(13)).toEqual([40, 0, 6000, 0, 'â€“', 'Growing']);
    } finally {
      appendSheetSpy.mockRestore();
    }
  });
});
