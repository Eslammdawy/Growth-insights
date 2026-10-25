/**
 * Shared growth color palette utilities.
 * Uses the CSS variables exposed from `tailwind.config.js` (`--color-up`, `--color-down`, etc.)
 * as the single source of truth across charts, heatmaps, and treemaps.
 */
import { Growth, GrowthStatus } from './metrics';

export const SHARED_PALETTE = {
  up: 'var(--color-up, #059669)',
  upLight: 'var(--color-up-light, #34D399)',
  upVivid: 'var(--color-up-vivid, #10B981)',
  down: 'var(--color-down, #E11D48)',
  downLight: 'var(--color-down-light, #FB7185)',
  downVivid: 'var(--color-down-vivid, #F43F5E)',
  new: '#f59e0b',
  flat: '#64748b',
} as const;

export const STATUS_LABEL: Record<GrowthStatus, string> = {
  growing: 'Growing',
  declining: 'Declining',
  new: 'New',
  lost: 'Lost (−100%)',
  flat: 'Flat',
};

export function statusColor(status: GrowthStatus, isDark = false): string {
  switch (status) {
    case 'growing':
      return isDark ? SHARED_PALETTE.upLight : SHARED_PALETTE.up;
    case 'declining':
      return isDark ? SHARED_PALETTE.downLight : SHARED_PALETTE.down;
    case 'lost':
      return isDark ? '#fb7185' : '#be123c';
    case 'new':
      return isDark ? '#fbbf24' : '#d97706';
    case 'flat':
    default:
      return isDark ? '#94a3b8' : '#64748b';
  }
}

export interface CellColorStyle {
  backgroundColor: string;
  borderColor: string;
  color: string;
}

/**
 * Computes a continuous color scale from the shared `up` / `down` palette
 * for heatmap cells and treemap tiles based on YoY Growth %.
 */
export function growthScaleStyle(g: Growth, isDark: boolean): CellColorStyle {
  if (g.kind === 'none') {
    return {
      backgroundColor: isDark ? 'rgba(51, 65, 85, 0.35)' : 'rgba(241, 245, 249, 0.85)',
      borderColor: isDark ? 'rgba(71, 85, 105, 0.45)' : 'rgba(203, 213, 225, 0.7)',
      color: isDark ? '#94a3b8' : '#64748b',
    };
  }
  if (g.kind === 'new') {
    return {
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.28)' : 'rgba(245, 158, 11, 0.18)',
      borderColor: isDark ? 'rgba(251, 191, 36, 0.5)' : 'rgba(217, 119, 6, 0.4)',
      color: isDark ? '#fde68a' : '#92400e',
    };
  }

  const val = g.kind === 'lost' ? -1 : g.value;
  if (Math.abs(val) < 1e-9) {
    return {
      backgroundColor: isDark ? 'rgba(51, 65, 85, 0.45)' : 'rgba(226, 232, 240, 0.8)',
      borderColor: isDark ? 'rgba(100, 116, 139, 0.4)' : 'rgba(148, 163, 184, 0.5)',
      color: isDark ? '#cbd5e1' : '#334155',
    };
  }

  // Clamp magnitude at 60% for full saturation
  const mag = Math.min(1, Math.abs(val) / 0.6);
  const alpha = isDark ? 0.18 + mag * 0.55 : 0.12 + mag * 0.58;
  const borderAlpha = isDark ? 0.35 + mag * 0.45 : 0.25 + mag * 0.45;

  if (val > 0) {
    // Shared `up` token (#059669 / #10B981)
    const highContrastText = isDark
      ? mag > 0.45
        ? '#ecfdf5'
        : '#6ee7b7'
      : mag > 0.55
        ? '#ffffff'
        : '#064e3b';
    return {
      backgroundColor: `color-mix(in srgb, var(--color-up) ${Math.round(alpha * 100)}%, ${isDark ? '#0f172a' : '#ffffff'})`,
      borderColor: `color-mix(in srgb, var(--color-up-light) ${Math.round(borderAlpha * 100)}%, transparent)`,
      color: highContrastText,
    };
  } else {
    // Shared `down` token (#E11D48 / #F43F5E)
    const highContrastText = isDark
      ? mag > 0.45
        ? '#fff1f2'
        : '#fda4af'
      : mag > 0.55
        ? '#ffffff'
        : '#881337';
    return {
      backgroundColor: `color-mix(in srgb, var(--color-down) ${Math.round(alpha * 100)}%, ${isDark ? '#0f172a' : '#ffffff'})`,
      borderColor: `color-mix(in srgb, var(--color-down-light) ${Math.round(borderAlpha * 100)}%, transparent)`,
      color: highContrastText,
    };
  }
}

/**
 * SVG-compatible fill color from the shared palette for Treemap tiles.
 */
export function treemapFillColor(g: Growth, isDark: boolean): { fill: string; stroke: string; text: string } {
  if (g.kind === 'none') {
    return {
      fill: isDark ? '#334155' : '#cbd5e1',
      stroke: isDark ? '#1e293b' : '#ffffff',
      text: isDark ? '#f8fafc' : '#1e293b',
    };
  }
  if (g.kind === 'new') {
    return {
      fill: isDark ? '#d97706' : '#f59e0b',
      stroke: isDark ? '#0f172a' : '#ffffff',
      text: '#ffffff',
    };
  }
  const val = g.kind === 'lost' ? -1 : g.value;
  if (Math.abs(val) < 1e-4) {
    return {
      fill: isDark ? '#475569' : '#94a3b8',
      stroke: isDark ? '#0f172a' : '#ffffff',
      text: '#ffffff',
    };
  }
  const mag = Math.min(1, Math.abs(val) / 0.5);
  if (val > 0) {
    // Interpolate along shared `up` palette (#34D399 -> #10B981 -> #059669 -> #047857)
    const fill =
      mag < 0.25
        ? '#10b981'
        : mag < 0.55
          ? 'var(--color-up)'
          : '#047857';
    return {
      fill,
      stroke: isDark ? '#0f172a' : '#ffffff',
      text: '#ffffff',
    };
  } else {
    // Interpolate along shared `down` palette (#FB7185 -> #F43F5E -> #E11D48 -> #BE123C)
    const fill =
      mag < 0.25
        ? '#f43f5e'
        : mag < 0.55
          ? 'var(--color-down)'
          : '#be123c';
    return {
      fill,
      stroke: isDark ? '#0f172a' : '#ffffff',
      text: '#ffffff',
    };
  }
}
