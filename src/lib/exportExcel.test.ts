import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  ExportableRowItem,
  exportDefectorWatchlistToExcel,
  exportLevelTableToExcel,
} from './exportExcel';
import { DerivedRow } from './metrics';

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
});
