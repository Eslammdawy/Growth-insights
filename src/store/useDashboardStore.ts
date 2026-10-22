/**
 * Global Zustand store for the Sales Growth Analyzer dashboard.
 * Manages dataset lifecycle (via Web Worker), per-Line filter memory, global filters,
 * drill-down chips, URL hash synchronization, and UI preferences.
 */
import { create } from 'zustand';
import {
  AnalysisQuery,
  AnalysisResult,
  DatasetMeta,
  DrillChip,
  LEVELS,
  Level,
  NEXT_LEVEL,
  itemOptions,
} from '../lib/aggregate';
import { LARGE_FILE_WARNING_BYTES, SAMPLE_DATA_URL, TX_TYPES, TxType } from '../lib/config';
import { DataErrorKind } from '../lib/columnar';
import { METRICS, Metric } from '../lib/metrics';
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

const ALL_LINES_KEY = '__ALL__';

function readHashParams(): { line?: string | null; level?: Level; metric?: Metric } {
  if (typeof window === 'undefined') return {};
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const out: { line?: string | null; level?: Level; metric?: Metric } = {};
  if (params.has('line')) {
    const l = params.get('line')!;
    out.line = l === 'all' || l === '' ? null : l;
  }
  const lvl = params.get('level') as Level | null;
  if (lvl && LEVELS.includes(lvl)) out.level = lvl;
  const m = params.get('metric') as Metric | null;
  if (m && METRICS.includes(m)) out.metric = m;
  return out;
}

function writeHashParams(line: string | null, level: Level, metric: Metric) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  params.set('line', line ?? 'all');
  params.set('level', level);
  params.set('metric', metric);
  const next = `#${params.toString()}`;
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
  largeFileWarning: string | null;
  result: AnalysisResult | null;

  // Query state
  period: PeriodSelection;
  metric: Metric;
  line: string | null;
  level: Level;
  txTypes: TxType[];
  mainTypes: string[];
  perLineFilters: Record<string, LineProductFilter>;
  drill: DrillChip[];

  // Table & Chart UI state
  statusFilter: StatusFilter;
  topN: number | null; // positive = Top N, negative = Bottom N, null = All
  search: string;
  expandedIds: string[];
  chartMode: 'delta' | 'growth';
  sidebarCollapsed: boolean;
  sidebarSearch: string;
  theme: 'light' | 'dark';

  // Actions
  loadSampleData: () => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  refreshAnalysis: () => Promise<void>;
  setMetric: (metric: Metric) => void;
  setLine: (line: string | null) => void;
  setLevel: (level: Level) => void;
  setPeriod: (patch: Partial<PeriodSelection>) => void;
  setTxTypes: (txTypes: TxType[]) => void;
  setMainTypes: (mainTypes: string[]) => void;
  setBrandsForCurrentLine: (brands: string[]) => void;
  setItemsForCurrentLine: (items: string[]) => void;
  addDrillRow: (chips: DrillChip[], stayOnLevel?: boolean) => void;
  removeDrillChip: (index: number) => void;
  clearDrillChips: () => void;
  resetFilters: () => void;
  setStatusFilter: (s: StatusFilter) => void;
  setTopN: (n: number | null) => void;
  setSearch: (s: string) => void;
  toggleExpanded: (id: string) => void;
  setChartMode: (m: 'delta' | 'growth') => void;
  setSidebarCollapsed: (c: boolean) => void;
  setSidebarSearch: (s: string) => void;
  toggleTheme: () => void;
  dismissLargeFileWarning: () => void;
  syncFromHash: () => void;
}

const initialHash = readHashParams();

export const useDashboardStore = create<DashboardState>((set, get) => ({
  meta: null,
  sourceName: '',
  loading: false,
  analyzing: false,
  progress: null,
  error: null,
  largeFileWarning: null,
  result: null,

  period: { cyYear: 2026, pyYear: 2025, quarter: 3, month: null, likeForLike: true },
  metric: initialHash.metric ?? 'value',
  line: initialHash.line ?? null,
  level: initialHash.level ?? 'subtype',
  txTypes: [...TX_TYPES],
  mainTypes: [],
  perLineFilters: {},
  drill: [],

  statusFilter: 'all',
  topN: null,
  search: '',
  expandedIds: ['SubType:Chain'],
  chartMode: 'delta',
  sidebarCollapsed: false,
  sidebarSearch: '',
  theme: getInitialTheme(),

  loadSampleData: async () => {
    set({ loading: true, error: null, progress: { phase: 'directory', ratio: 0.02, rows: 0 }, largeFileWarning: null });
    try {
      const { meta, sourceName } = await workerClient.loadUrl(SAMPLE_DATA_URL, (progress) => {
        set({ progress });
      });
      const defPeriod = defaultSelection(meta.availability);
      const hash = readHashParams();
      const validLine = hash.line && meta.lines.includes(hash.line) ? hash.line : null;
      set({
        meta,
        sourceName,
        period: defPeriod,
        line: validLine,
        loading: false,
        progress: null,
      });
      writeHashParams(validLine, get().level, get().metric);
      await get().refreshAnalysis();
    } catch (e) {
      const err = e as { message?: string; kind?: DataErrorKind; details?: string[] };
      set({
        loading: false,
        progress: null,
        error: {
          message: err.message ?? 'Failed to load sample dataset.',
          kind: err.kind,
          details: err.details,
        },
      });
    }
  },

  loadFile: async (file: File) => {
    const isLargeXlsx = file.name.toLowerCase().endsWith('.xlsx') && file.size > LARGE_FILE_WARNING_BYTES;
    const warning = isLargeXlsx
      ? `Large workbook (${(file.size / 1024 / 1024).toFixed(1)} MB). Streaming in Web Worker — for instant loading next time, run: npm run convert -- "${file.name}"`
      : null;
    set({
      loading: true,
      error: null,
      largeFileWarning: warning,
      progress: { phase: 'directory', ratio: 0.01, rows: 0 },
    });
    try {
      const { meta, sourceName } = await workerClient.loadFile(file, (progress) => {
        set({ progress });
      });
      const defPeriod = defaultSelection(meta.availability);
      set({
        meta,
        sourceName,
        period: defPeriod,
        line: null,
        perLineFilters: {},
        drill: [],
        loading: false,
        progress: null,
      });
      writeHashParams(null, get().level, get().metric);
      await get().refreshAnalysis();
    } catch (e) {
      const err = e as { message?: string; kind?: DataErrorKind; details?: string[] };
      set({
        loading: false,
        progress: null,
        error: {
          message: err.message ?? 'Failed to parse uploaded file.',
          kind: err.kind,
          details: err.details,
        },
      });
    }
  },

  refreshAnalysis: async () => {
    const st = get();
    if (!st.meta) return;
    const key = st.line ?? ALL_LINES_KEY;
    const lf = st.perLineFilters[key] ?? { brands: [], items: [] };
    const query: AnalysisQuery = {
      period: st.period,
      txTypes: st.txTypes,
      line: st.line,
      brands: lf.brands,
      items: lf.items,
      mainTypes: st.mainTypes,
      drill: st.drill,
      level: st.level,
    };
    set({ analyzing: true });
    try {
      const result = await workerClient.analyze(query);
      set({ result, analyzing: false, error: null });
    } catch (e) {
      const err = e as { message?: string; kind?: DataErrorKind; details?: string[] };
      set({
        analyzing: false,
        error: { message: err.message ?? 'Aggregation error', kind: err.kind, details: err.details },
      });
    }
  },

  setMetric: (metric) => {
    const { line, level } = get();
    set({ metric });
    writeHashParams(line, level, metric);
  },

  setLine: (line) => {
    const { level, metric } = get();
    set({ line });
    writeHashParams(line, level, metric);
    void get().refreshAnalysis();
  },

  setLevel: (level) => {
    const { line, metric } = get();
    set({ level, search: '' });
    writeHashParams(line, level, metric);
    void get().refreshAnalysis();
  },

  setPeriod: (patch) => {
    const next = { ...get().period, ...patch };
    set({ period: next });
    void get().refreshAnalysis();
  },

  setTxTypes: (txTypes) => {
    set({ txTypes });
    void get().refreshAnalysis();
  },

  setMainTypes: (mainTypes) => {
    set({ mainTypes });
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
    void get().refreshAnalysis();
  },

  addDrillRow: (chips, stayOnLevel = false) => {
    const st = get();
    const nextDrill = [...st.drill];
    for (const chip of chips) {
      const idx = nextDrill.findIndex((c) => c.field === chip.field);
      if (idx >= 0) nextDrill[idx] = chip;
      else nextDrill.push(chip);
    }
    const nextLevel = stayOnLevel ? st.level : NEXT_LEVEL[st.level];
    set({ drill: nextDrill, level: nextLevel, search: '' });
    writeHashParams(st.line, nextLevel, st.metric);
    void get().refreshAnalysis();
  },

  removeDrillChip: (index) => {
    const st = get();
    const nextDrill = st.drill.filter((_, i) => i !== index);
    set({ drill: nextDrill });
    void get().refreshAnalysis();
  },

  clearDrillChips: () => {
    set({ drill: [] });
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
      statusFilter: 'all',
      topN: null,
      search: '',
    });
    void get().refreshAnalysis();
  },

  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setTopN: (topN) => set({ topN }),
  setSearch: (search) => set({ search }),

  toggleExpanded: (id) => {
    const cur = get().expandedIds;
    set({
      expandedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    });
  },

  setChartMode: (chartMode) => set({ chartMode }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setSidebarSearch: (sidebarSearch) => set({ sidebarSearch }),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    if (typeof window !== 'undefined') window.localStorage.setItem('sga-theme', next);
    set({ theme: next });
  },

  dismissLargeFileWarning: () => set({ largeFileWarning: null }),

  syncFromHash: () => {
    const h = readHashParams();
    const st = get();
    let needRefresh = false;
    const patch: Partial<DashboardState> = {};
    if (h.metric && h.metric !== st.metric) patch.metric = h.metric;
    if (h.level && h.level !== st.level) {
      patch.level = h.level;
      needRefresh = true;
    }
    if (h.line !== undefined) {
      const validLine = h.line && st.meta?.lines.includes(h.line) ? h.line : null;
      if (validLine !== st.line) {
        patch.line = validLine;
        needRefresh = true;
      }
    }
    if (Object.keys(patch).length > 0) {
      set(patch);
      if (needRefresh) void get().refreshAnalysis();
    }
  },
}));
