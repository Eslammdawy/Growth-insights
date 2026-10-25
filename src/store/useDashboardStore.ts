/**
 * Global Zustand store for the Sales Growth Analyzer dashboard.
 * Manages dataset lifecycle (via Web Worker), per-Line filter memory, global filters,
 * cross-filter chips, per-row Item breakdowns, URL hash synchronization, and UI preferences.
 */
import { create } from 'zustand';
import {
  AnalysisQuery,
  AnalysisResult,
  DatasetMeta,
  DrillChip,
  GroupRow,
  ItemTarget,
  Level,
  itemOptions,
} from '../lib/aggregate';
import { SAMPLE_DATA_URL, TX_TYPES, TxType } from '../lib/config';
import { DataErrorKind } from '../lib/columnar';
import { Metric } from '../lib/metrics';
import { ParseProgress } from '../lib/parse';
import { PeriodSelection, defaultSelection } from '../lib/periods';
import { workerClient } from '../workers/workerClient';

export interface LineProductFilter {
  brands: string[];
  items: string[];
}

export type StatusFilter = 'all' | 'growing' | 'declining' | 'new' | 'lost';

export interface LoadErrorState {
  message: string;
  kind?: DataErrorKind;
  details?: string[];
}

/** Item breakdown state of one table row: loaded rows, or loading / error marker. */
export type ItemsEntry = GroupRow[] | 'loading' | 'error';

import {
  parseHashParams,
  validateHashAgainstMeta,
  serializeHashState,
  getHashSnapshot,
} from '../lib/hashState';

const ALL_LINES_KEY = '__ALL__';

function syncHashToUrl(st: DashboardState) {
  if (typeof window === 'undefined') return;
  const lineKey = st.line ?? ALL_LINES_KEY;
  const filter = st.perLineFilters[lineKey];
  const next = serializeHashState({
    metric: st.metric,
    line: st.line,
    period: st.period,
    mainTypes: st.mainTypes,
    txTypes: st.txTypes,
    brands: filter?.brands,
    items: filter?.items,
    drill: st.drill,
  });
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next);
  }
}

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem('sga-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export interface DashboardState {
  // Data & Worker state
  meta: DatasetMeta | null;
  sourceName: string;
  loading: boolean;
  analyzing: boolean;
  progress: ParseProgress | null;
  error: LoadErrorState | null;
  result: AnalysisResult | null;
  /** Item breakdowns keyed by table row id (cleared whenever the analysis is refreshed). */
  itemsByRow: Record<string, ItemsEntry>;

  // Query state
  period: PeriodSelection;
  metric: Metric;
  line: string | null;
  txTypes: TxType[];
  mainTypes: string[];
  perLineFilters: Record<string, LineProductFilter>;
  drill: DrillChip[];

  // Chart & UI state
  chartMode: 'delta' | 'growth';
  chartLevel: Level;
  sidebarCollapsed: boolean;
  sidebarSearch: string;
  theme: 'light' | 'dark';

  // Actions
  loadSampleData: () => Promise<void>;
  refreshAnalysis: () => Promise<void>;
  fetchItems: (rowId: string, target: ItemTarget) => Promise<void>;
  setMetric: (metric: Metric) => void;
  setLine: (line: string | null) => void;
  setPeriod: (patch: Partial<PeriodSelection>) => void;
  setTxTypes: (txTypes: TxType[]) => void;
  setMainTypes: (mainTypes: string[]) => void;
  setBrandsForCurrentLine: (brands: string[]) => void;
  setItemsForCurrentLine: (items: string[]) => void;
  addDrillRow: (chips: DrillChip[]) => void;
  removeDrillChip: (index: number) => void;
  clearDrillChips: () => void;
  resetFilters: () => void;
  setChartMode: (m: 'delta' | 'growth') => void;
  setChartLevel: (l: Level) => void;
  setSidebarCollapsed: (c: boolean) => void;
  setSidebarSearch: (s: string) => void;
  mobileDrawerOpen: boolean;
  setMobileDrawerOpen: (open: boolean) => void;
  toggleTheme: () => void;
  syncFromHash: (hashString?: string) => void;
}

const initialHash = parseHashParams(getHashSnapshot());

/** Incremented on every analysis refresh so stale Item responses are discarded. */
let analysisVersion = 0;

function currentQuery(st: DashboardState): AnalysisQuery {
  const key = st.line ?? ALL_LINES_KEY;
  const lf = st.perLineFilters[key] ?? { brands: [], items: [] };
  return {
    period: st.period,
    txTypes: st.txTypes,
    line: st.line,
    brands: lf.brands,
    items: lf.items,
    mainTypes: st.mainTypes,
    drill: st.drill,
  };
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  meta: null,
  sourceName: '',
  loading: false,
  analyzing: false,
  progress: null,
  error: null,
  result: null,
  itemsByRow: {},

  period: { cyYear: 2026, pyYear: 2025, quarter: 3, month: null, likeForLike: true },
  metric: initialHash.metric ?? 'value',
  line: initialHash.line ?? null,
  txTypes: [...TX_TYPES],
  mainTypes: [],
  perLineFilters: {},
  drill: [],

  chartMode: 'delta',
  chartLevel: 'subtype',
  sidebarCollapsed: false,
  sidebarSearch: '',
  theme: getInitialTheme(),

  loadSampleData: async () => {
    set({ loading: true, error: null, progress: { phase: 'directory', ratio: 0.02, rows: 0 } });
    try {
      const { meta, sourceName } = await workerClient.loadUrl(SAMPLE_DATA_URL, (progress) => {
        set({ progress });
      });
      const defPeriod = defaultSelection(meta.availability);
      const initialHash = parseHashParams(getHashSnapshot());
      const v = validateHashAgainstMeta(initialHash, meta, defPeriod);
      const initialFilters: Record<string, { brands: string[]; items: string[] }> = {};
      if (v.brands.length > 0 || v.items.length > 0) {
        initialFilters[v.line ?? ALL_LINES_KEY] = { brands: v.brands, items: v.items };
      }
      set({
        meta,
        sourceName,
        metric: v.metric ?? get().metric,
        line: v.line,
        period: v.period,
        mainTypes: v.mainTypes,
        txTypes: v.txTypes,
        drill: v.drill,
        perLineFilters: initialFilters,
        loading: false,
        progress: null,
      });
      syncHashToUrl(get());
      await get().refreshAnalysis();
    } catch (e) {
      const err = e as { message?: string; kind?: DataErrorKind; details?: string[] };
      set({
        loading: false,
        progress: null,
        error: {
          message: err.message ?? 'Failed to load dataset.',
          kind: err.kind,
          details: err.details,
        },
      });
    }
  },

  refreshAnalysis: async () => {
    const st = get();
    if (!st.meta) return;
    const version = ++analysisVersion;
    set({ analyzing: true, itemsByRow: {} });
    try {
      const result = await workerClient.analyze(currentQuery(st));
      if (version !== analysisVersion) return;
      set({ result, analyzing: false, error: null, itemsByRow: {} });
    } catch (e) {
      if (version !== analysisVersion) return;
      if ((e as Error)?.name === 'AbortError') return;
      const err = e as { message?: string; kind?: DataErrorKind; details?: string[] };
      set({
        analyzing: false,
        error: { message: err.message ?? 'Aggregation error', kind: err.kind, details: err.details },
      });
    }
  },

  fetchItems: async (rowId, target) => {
    const st = get();
    if (!st.meta) return;
    const existing = st.itemsByRow[rowId];
    if (existing && existing !== 'error') return;
    const version = analysisVersion;
    set({ itemsByRow: { ...st.itemsByRow, [rowId]: 'loading' } });
    try {
      const rows = await workerClient.items(currentQuery(st), target);
      if (version !== analysisVersion) return;
      set({ itemsByRow: { ...get().itemsByRow, [rowId]: rows } });
    } catch {
      if (version !== analysisVersion) return;
      set({ itemsByRow: { ...get().itemsByRow, [rowId]: 'error' } });
    }
  },

  setMetric: (metric) => {
    set({ metric });
    syncHashToUrl(get());
  },

  setLine: (line) => {
    set({ line });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setPeriod: (patch) => {
    const next = { ...get().period, ...patch };
    set({ period: next });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setTxTypes: (txTypes) => {
    set({ txTypes });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setMainTypes: (mainTypes) => {
    set({ mainTypes });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setBrandsForCurrentLine: (brands) => {
    const st = get();
    const key = st.line ?? ALL_LINES_KEY;
    const prev = st.perLineFilters[key] ?? { brands: [], items: [] };
    const validItems = st.meta ? new Set(itemOptions(st.meta, st.line, brands)) : null;
    const nextItems = validItems ? prev.items.filter((i) => validItems.has(i)) : prev.items;
    set({
      perLineFilters: {
        ...st.perLineFilters,
        [key]: { brands, items: nextItems },
      },
    });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setItemsForCurrentLine: (items) => {
    const st = get();
    const key = st.line ?? ALL_LINES_KEY;
    const prev = st.perLineFilters[key] ?? { brands: [], items: [] };
    set({
      perLineFilters: {
        ...st.perLineFilters,
        [key]: { ...prev, items },
      },
    });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  addDrillRow: (chips) => {
    const st = get();
    const nextDrill = [...st.drill];
    for (const chip of chips) {
      const idx = nextDrill.findIndex((c) => c.field === chip.field);
      if (idx >= 0) nextDrill[idx] = chip;
      else nextDrill.push(chip);
    }
    set({ drill: nextDrill });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  removeDrillChip: (index) => {
    const st = get();
    const nextDrill = st.drill.filter((_, i) => i !== index);
    set({ drill: nextDrill });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  clearDrillChips: () => {
    set({ drill: [] });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  resetFilters: () => {
    const st = get();
    const key = st.line ?? ALL_LINES_KEY;
    set({
      txTypes: [...TX_TYPES],
      mainTypes: [],
      perLineFilters: {
        ...st.perLineFilters,
        [key]: { brands: [], items: [] },
      },
      drill: [],
    });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setChartMode: (chartMode) => set({ chartMode }),
  setChartLevel: (chartLevel) => set({ chartLevel }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setSidebarSearch: (sidebarSearch) => set({ sidebarSearch }),
  mobileDrawerOpen: false,
  setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    if (typeof window !== 'undefined') window.localStorage.setItem('sga-theme', next);
    set({ theme: next });
  },

  syncFromHash: (hashString?: string) => {
    const st = get();
    if (!st.meta) return;
    const hash = hashString ?? getHashSnapshot();
    const parsed = parseHashParams(hash);
    const v = validateHashAgainstMeta(parsed, st.meta, st.period);
    const lineKey = v.line ?? ALL_LINES_KEY;
    const nextFilters = { ...st.perLineFilters };
    if (v.brands.length > 0 || v.items.length > 0) {
      nextFilters[lineKey] = { brands: v.brands, items: v.items };
    }
    set({
      metric: v.metric ?? st.metric,
      line: v.line,
      period: v.period,
      mainTypes: v.mainTypes,
      txTypes: v.txTypes,
      drill: v.drill,
      perLineFilters: nextFilters,
    });
    void get().refreshAnalysis();
  },
}));
