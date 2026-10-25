import React, { useMemo, useState, useTransition } from 'react';
import { LayoutGrid, RotateCcw, Table2 } from 'lucide-react';
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import { DrillField, INSIGHT_LEVELS, INSIGHT_LEVEL_LABEL, InsightLevel } from '../lib/aggregate';
import { fmtCompact, fmtGrowth, fmtPct, fmtSigned, fmtValue } from '../lib/format';
import { Growth, growth, shareOfTotal } from '../lib/metrics';
import { treemapFillColor } from '../lib/palette';
import { useDashboardStore } from '../store/useDashboardStore';

interface TreemapLeaf {
  id: string;
  field: DrillField | 'Item';
  value: string;
  name: string;
  size: number; // CY Value
  pyV: number;
  cyV: number;
  deltaV: number;
  growth: Growth;
  growthText: string;
  shareCy: number | null;
}

interface CustomTreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  growth?: Growth;
  growthText?: string;
  field?: DrillField | 'Item';
  value?: string;
  isDark: boolean;
  onSelect: (field: DrillField | 'Item', value: string, label: string) => void;
}

const CustomTreemapTile: React.FC<CustomTreemapContentProps> = (props) => {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    name = '',
    size = 0,
    growth: g,
    growthText = '',
    field,
    value,
    isDark,
    onSelect,
  } = props;

  if (width <= 2 || height <= 2 || !g) return null;

  const colors = treemapFillColor(g, isDark);
  const showTitle = width >= 54 && height >= 26;
  const showSub = width >= 72 && height >= 44;
  const maxChars = Math.max(4, Math.floor((width - 12) / 6.5));
  const displayTitle = name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;

  return (
    <g
      onClick={() => {
        if (field && value !== undefined) {
          onSelect(field, value, name);
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={6}
        ry={6}
        style={{
          fill: colors.fill,
          stroke: colors.stroke,
          strokeWidth: 1.5,
          fillOpacity: isDark ? 0.88 : 0.92,
        }}
      />
      {showTitle && (
        <text
          x={x + 7}
          y={y + 16}
          fill={colors.text}
          fontSize={11}
          fontWeight={700}
          style={{ pointerEvents: 'none' }}
        >
          {displayTitle}
        </text>
      )}
      {showSub && (
        <text
          x={x + 7}
          y={y + 31}
          fill={colors.text}
          fillOpacity={0.92}
          fontSize={10}
          fontWeight={600}
          style={{ pointerEvents: 'none' }}
        >
          {fmtCompact(size)} · {growthText}
        </text>
      )}
    </g>
  );
};

export const CyTreemap: React.FC = () => {
  const [, startTransition] = useTransition();
  const [level, setLevel] = useState<InsightLevel>('subtype');
  const [showTable, setShowTable] = useState(false);

  const {
    result,
    theme,
    addDrillRow,
    drill,
    resetFilters,
  } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      theme: s.theme,
      addDrillRow: s.addDrillRow,
      drill: s.drill,
      resetFilters: s.resetFilters,
    }))
  );

  const leaves = useMemo<TreemapLeaf[]>(() => {
    if (!result) return [];
    const sourceRows = result.insights.byLevel[level] ?? [];
    const totalCyV = result.totals.cyV;
    const out: TreemapLeaf[] = [];
    for (const r of sourceRows) {
      if (r.sums.cyV <= 0) continue;
      const g = growth(r.sums.pyV, r.sums.cyV);
      out.push({
        id: r.id,
        field: r.field,
        value: r.value,
        name: r.label,
        size: r.sums.cyV,
        pyV: r.sums.pyV,
        cyV: r.sums.cyV,
        deltaV: r.valueDelta,
        growth: g,
        growthText: fmtGrowth(g),
        shareCy: shareOfTotal(r.sums.cyV, totalCyV),
      });
    }
    out.sort((a, b) => b.size - a.size);
    return out.slice(0, 36);
  }, [result, level]);

  const handleSelectTile = (field: DrillField | 'Item', value: string, label: string) => {
    startTransition(() => {
      addDrillRow([{ field, value, label }]);
    });
  };

  if (!result || leaves.length === 0) {
    return (
      <div className="glass-panel flex h-[340px] flex-col items-center justify-center rounded-2xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
        <LayoutGrid className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        <h3 className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          CY Value Treemap ({INSIGHT_LEVEL_LABEL[level]})
        </h3>
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
          No positive CY Value entries available for the current selection.
        </p>
        {drill.length > 0 && (
          <button
            type="button"
            onClick={() => startTransition(() => resetFilters())}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset filters
          </button>
        )}
      </div>
    );
  }

  const isDark = theme === 'dark';

  const textSummary = leaves
    .slice(0, 5)
    .map(
      (l) =>
        `${l.name}: CY ${fmtValue(l.cyV)} (${fmtPct(l.shareCy)} share, YoY ${l.growthText})`
    )
    .join('; ');

  return (
    <div className="glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-indigo-200/70 p-3.5 dark:border-slate-800/80">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-emerald-500 to-amber-500" />

      <p className="sr-only">
        Treemap of CY Value (EGP) by {INSIGHT_LEVEL_LABEL[level]} colored by YoY value growth: {textSummary}.
      </p>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
              CY Value Treemap Colored by Growth
            </h2>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Area = CY Value (EGP) · Color = YoY Value Growth % · Click tile to filter
            </p>
          </div>

          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as InsightLevel)}
            aria-label="Treemap level selection"
            className="rounded-lg border border-indigo-200/80 bg-white/85 px-2.5 py-0.5 text-xs font-bold text-indigo-900 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-indigo-200"
          >
            {INSIGHT_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl} className="bg-white dark:bg-slate-900">
                {INSIGHT_LEVEL_LABEL[lvl]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300 sm:flex">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-up" />
              Growing
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-down" />
              Declining
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              New
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            aria-label={showTable ? 'Show CY Value treemap' : 'Show CY Value treemap data table'}
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              showTable
                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                : 'border-indigo-200/80 bg-white/80 text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
            }`}
          >
            {showTable ? <LayoutGrid className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
            <span>{showTable ? 'Treemap' : 'Table'}</span>
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="h-[280px] w-full overflow-auto rounded-xl border border-indigo-100/80 dark:border-slate-800">
          <table className="w-full border-collapse text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-indigo-50/95 text-[11px] font-extrabold uppercase tracking-wider text-indigo-950 dark:bg-slate-900/95 dark:text-indigo-200">
              <tr>
                <th className="border-b border-indigo-200/70 px-3 py-2 dark:border-slate-800">
                  {INSIGHT_LEVEL_LABEL[level]}
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  PY Value
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  CY Value
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  CY Share
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  YoY Δ
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  YoY %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800/70">
              {leaves.map((l) => (
                <tr key={l.id} className="hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10">
                  <td className="px-3 py-1.5 font-semibold text-slate-900 dark:text-slate-100" dir="auto">
                    <button
                      type="button"
                      onClick={() => handleSelectTile(l.field, l.value, l.name)}
                      className="text-left hover:text-indigo-600 hover:underline dark:hover:text-cyan-400"
                    >
                      {l.name}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">
                    {fmtValue(l.pyV)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-slate-900 dark:text-white">
                    {fmtValue(l.cyV)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">
                    {fmtPct(l.shareCy)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-bold ${
                      l.deltaV >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                    }`}
                  >
                    {fmtSigned(l.deltaV, 'value')}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-extrabold ${
                      l.deltaV >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                    }`}
                  >
                    {l.growthText}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={leaves}
              dataKey="size"
              aspectRatio={4 / 3}
              isAnimationActive={false}
              content={
                <CustomTreemapTile
                  isDark={isDark}
                  onSelect={handleSelectTile}
                />
              }
            >
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const node = payload[0]?.payload as TreemapLeaf | undefined;
                  if (!node || node.cyV === undefined) return null;
                  return (
                    <div className="rounded-xl border border-indigo-200/90 bg-white/95 p-2.5 text-xs shadow-lg backdrop-blur-md dark:border-indigo-500/40 dark:bg-slate-900/95">
                      <div className="mb-1.5 font-extrabold text-slate-900 dark:text-white" dir="auto">
                        {node.name}
                      </div>
                      <div className="space-y-1 tabular-nums">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">CY Value:</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {fmtValue(node.cyV)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">PY Value:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {fmtValue(node.pyV)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">CY Share of Total:</span>
                          <span className="font-semibold text-indigo-600 dark:text-cyan-300">
                            {fmtPct(node.shareCy)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-t border-slate-200/70 pt-1 dark:border-slate-800">
                          <span className="text-slate-500 dark:text-slate-400">YoY Value Δ:</span>
                          <span
                            className={`font-bold ${
                              node.deltaV >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                            }`}
                          >
                            {fmtSigned(node.deltaV, 'value')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">YoY Growth %:</span>
                          <span
                            className={`font-extrabold ${
                              node.deltaV >= 0 ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                            }`}
                          >
                            {node.growthText}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
            </Treemap>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
