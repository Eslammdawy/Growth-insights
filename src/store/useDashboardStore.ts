/**
 * Global Zustand store for the Sales Growth Analyzer dashboard.
 * Manages dataset lifecycle (via Web Worker), guided cascading filters,
 * cross-filter chips, per-row Item breakdowns, URL hash synchronization, and UI preferences.
 */
import { create } from 'zustand';
import {
  AnalysisQuery,
  AnalysisResult,
  DatasetMeta,
  DrillChip,
  GroupRow,
  InsightLevel,
  ItemTarget,
  Level,
  itemOptions,
  subTypeOptions,
} from '../lib/aggregate';
import { SAMPLE_DATA_URL, TX_TYPES, TxType } from '../lib/config';
import { DataErrorKind } from '../lib/columnar';
import { Metric } from '../lib/metrics';
import { ParseProgress } from '../lib/parse';
import { PeriodSelection, defaultSelection } from '../lib/periods';
import { workerClient } from '../workers/workerClient';
import {
  HeatmapMode,
  parseHashParams,
  validateHashAgainstMeta,
  serializeHashState,
  getHashSnapshot,
} from '../lib/hashState';

export type StatusFilter = 'all' | 'growing' | 'stable' | 'declining' | 'new' | 'lost';

export interface LoadErrorState {
  message: string;
  kind?: DataErrorKind;
  details?: string[];
}

/** Item breakdown state of one table row: loaded rows, or loading / error marker. */
export type ItemsEntry = GroupRow[] | 'loading' | 'error';

function syncHashToUrl(st: DashboardState) {
  if (typeof window === 'undefined') return;
  const next = serializeHashState({
    metric: st.metric,
    line: null,
    period: st.period,
    mainTypes: st.mainTypes,
    subTypes: st.subTypes,
    distributors: st.distributors,
    territories: st.territories,
    txTypes: st.txTypes,
    brands: st.brands,
    items: st.items,
    drill: st.drill,
    driverLevel: st.driverLevel,
    showReturns: st.showReturns,
    heatmapMode: st.heatmapMode,
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

  // Query state (always All Lines: line is null)
  period: PeriodSelection;
  metric: Metric;
  txTypes: TxType[];
  mainTypes: string[];
  subTypes: string[];
  distributors: string[];
  territories: string[];
  brands: string[];
  items: string[];
  drill: DrillChip[];

  // Chart & UI state
  chartMode: 'delta' | 'growth';
  chartLevel: Level;
  driverLevel: InsightLevel;
  showReturns: boolean;
  heatmapMode: HeatmapMode;
  customerStatusFilter: StatusFilter;
  theme: 'light' | 'dark';

  // Actions
  loadSampleData: () => Promise<void>;
  refreshAnalysis: () => Promise<void>;
  fetchItems: (rowId: string, target: ItemTarget) => Promise<void>;
  setMetric: (metric: Metric) => void;
  setPeriod: (patch: Partial<PeriodSelection>) => void;
  setTxTypes: (txTypes: TxType[]) => void;
  setMainTypes: (mainTypes: string[]) => void;
  setSubTypes: (subTypes: string[]) => void;
  setDistributors: (distributors: string[]) => void;
  setTerritories: (territories: string[]) => void;
  setBrands: (brands: string[]) => void;
  setItems: (items: string[]) => void;
  addDrillRow: (chips: DrillChip[]) => void;
  removeDrillChip: (index: number) => void;
  clearDrillChips: () => void;
  resetFilters: () => void;
  setChartMode: (m: 'delta' | 'growth') => void;
  setChartLevel: (l: Level) => void;
  setDriverLevel: (l: InsightLevel) => void;
  setShowReturns: (show: boolean) => void;
  setHeatmapMode: (m: HeatmapMode) => void;
  setCustomerStatusFilter: (s: StatusFilter) => void;
  toggleTheme: () => void;
  syncFromHash: (hashString?: string) => void;
}

const initialHash = parseHashParams(getHashSnapshot());

/** Incremented on every analysis refresh so stale Item responses are discarded. */
let analysisVersion = 0;

function currentQuery(st: DashboardState): AnalysisQuery {
  return {
    period: st.period,
    txTypes: st.txTypes,
    line: null,
    brands: st.brands,
    items: st.items,
    mainTypes: st.mainTypes,
    subTypes: st.subTypes,
    distributors: st.distributors,
    territories: st.territories,
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
  txTypes: [...TX_TYPES],
  mainTypes: [],
  subTypes: [],
  distributors: [],
  territories: [],
  brands: [],
  items: [],
  drill: [],

  chartMode: 'delta',
  chartLevel: 'subtype',
  driverLevel: initialHash.driverLevel ?? 'subtype',
  showReturns: initialHash.showReturns ?? false,
  heatmapMode: initialHash.heatmapMode ?? 'yoy',
  customerStatusFilter: 'all',
  theme: getInitialTheme(),

  loadSampleData: async () => {
    set({ loading: true, error: null, progress: { phase: 'directory', ratio: 0.02, rows: 0 } });
    try {
      const { meta, sourceName } = await workerClient.loadUrl(SAMPLE_DATA_URL, (progress) => {
        set({ progress });
      });
      const defPeriod = defaultSelection(meta.availability);
      const initialHash = parseHashParams(getHashSnapshot());
      const v = validateHashAgainstMeta({ ...initialHash, line: null }, meta, defPeriod);
      set({
        meta,
        sourceName,
        metric: v.metric ?? get().metric,
        period: v.period,
        mainTypes: v.mainTypes,
        subTypes: v.subTypes,
        distributors: v.distributors,
        territories: v.territories,
        txTypes: v.txTypes,
        brands: v.brands,
        items: v.items,
        drill: v.drill,
        driverLevel: v.driverLevel ?? get().driverLevel,
        showReturns: v.showReturns ?? get().showReturns,
        heatmapMode: v.heatmapMode ?? get().heatmapMode,
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
    const st = get();
    const validSubTypes = st.meta ? new Set(subTypeOptions(st.meta, mainTypes)) : null;
    const nextSubTypes = validSubTypes
      ? st.subTypes.filter((s) => validSubTypes.has(s))
      : st.subTypes;
    set({ mainTypes, subTypes: nextSubTypes });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setSubTypes: (subTypes) => {
    set({ subTypes });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setDistributors: (distributors) => {
    set({ distributors });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setTerritories: (territories) => {
    set({ territories });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setBrands: (brands) => {
    const st = get();
    const validItems = st.meta ? new Set(itemOptions(st.meta, null, brands)) : null;
    const nextItems = validItems ? st.items.filter((i) => validItems.has(i)) : st.items;
    set({ brands, items: nextItems });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setItems: (items) => {
    set({ items });
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
    set({
      txTypes: [...TX_TYPES],
      mainTypes: [],
      subTypes: [],
      distributors: [],
      territories: [],
      brands: [],
      items: [],
      drill: [],
    });
    syncHashToUrl(get());
    void get().refreshAnalysis();
  },

  setChartMode: (chartMode) => set({ chartMode }),
  setChartLevel: (chartLevel) => set({ chartLevel }),
  setDriverLevel: (driverLevel) => {
    set({ driverLevel });
    syncHashToUrl(get());
  },
  setShowReturns: (showReturns) => {
    set({ showReturns });
    syncHashToUrl(get());
  },
  setHeatmapMode: (heatmapMode) => {
    set({ heatmapMode });
    syncHashToUrl(get());
  },
  setCustomerStatusFilter: (customerStatusFilter) => set({ customerStatusFilter }),

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
    const v = validateHashAgainstMeta({ ...parsed, line: null }, st.meta, st.period);
    set({
      metric: v.metric ?? st.metric,
      period: v.period,
      mainTypes: v.mainTypes,
      subTypes: v.subTypes,
      distributors: v.distributors,
      territories: v.territories,
      txTypes: v.txTypes,
      brands: v.brands,
      items: v.items,
      drill: v.drill,
      driverLevel: v.driverLevel ?? st.driverLevel,
      showReturns: v.showReturns ?? st.showReturns,
      heatmapMode: v.heatmapMode ?? st.heatmapMode,
    });
    void get().refreshAnalysis();
  },
}));
