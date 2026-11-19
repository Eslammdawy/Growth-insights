/**
 * Pure state engine for Excel-style checkbox filters (all checked by default).
 * Tracks explicit `exclude` vs `include` intent so upstream scope changes preserve user intent.
 */

export type CheckboxFilterState =
  | { mode: 'exclude'; values: string[] }
  | { mode: 'include'; values: string[] };

export const ALL_CHECKED: CheckboxFilterState = { mode: 'exclude', values: [] };

export interface ResolvedCheckboxFilter {
  checked: string[];
  excluded: string[];
  checkedSet: Set<string>;
  excludedSet: Set<string>;
  isActive: boolean;
  displayMode: 'all' | 'exclude' | 'include';
}

export interface CheckboxToggleOutcome {
  next?: CheckboxFilterState;
  draftEmpty: boolean;
}

export function resolveCheckboxFilter(
  state: CheckboxFilterState,
  options: readonly string[],
): ResolvedCheckboxFilter {
  const valueSet = new Set(state.values);
  const checked: string[] = [];
  const excluded: string[] = [];

  if (state.mode === 'exclude') {
    for (const opt of options) {
      if (valueSet.has(opt)) excluded.push(opt);
      else checked.push(opt);
    }
  } else {
    for (const opt of options) {
      if (valueSet.has(opt)) checked.push(opt);
      else excluded.push(opt);
    }
  }

  const isActive = options.length > 0 && checked.length > 0 && checked.length < options.length;
  const displayMode: 'all' | 'exclude' | 'include' = !isActive
    ? 'all'
    : excluded.length < checked.length
      ? 'exclude'
      : 'include';

  return {
    checked,
    excluded,
    checkedSet: new Set(checked),
    excludedSet: new Set(excluded),
    isActive,
    displayMode,
  };
}

export function toggleCheckboxOption(
  state: CheckboxFilterState,
  options: readonly string[],
  opt: string,
  draftEmpty: boolean,
): CheckboxToggleOutcome {
  if (draftEmpty) {
    return {
      next: options.length <= 1 ? ALL_CHECKED : { mode: 'include', values: [opt] },
      draftEmpty: false,
    };
  }

  const { checked, excluded, checkedSet } = resolveCheckboxFilter(state, options);

  if (checkedSet.has(opt)) {
    if (checked.length <= 1) {
      return { draftEmpty: true };
    }
    if (state.mode === 'exclude') {
      const nextExcluded = options.filter((o) => o === opt || !checkedSet.has(o));
      return { next: { mode: 'exclude', values: nextExcluded }, draftEmpty: false };
    }
    return {
      next: { mode: 'include', values: checked.filter((x) => x !== opt) },
      draftEmpty: false,
    };
  }

  if (checked.length + 1 >= options.length) {
    return { next: ALL_CHECKED, draftEmpty: false };
  }
  if (state.mode === 'exclude') {
    return {
      next: { mode: 'exclude', values: excluded.filter((x) => x !== opt) },
      draftEmpty: false,
    };
  }
  const nextChecked = options.filter((o) => checkedSet.has(o) || o === opt);
  return { next: { mode: 'include', values: nextChecked }, draftEmpty: false };
}

export function selectOnlyCheckboxOption(
  options: readonly string[],
  opt: string,
): CheckboxFilterState {
  return options.length <= 1 ? ALL_CHECKED : { mode: 'include', values: [opt] };
}

export function toggleAllCheckboxOptions(
  state: CheckboxFilterState,
  options: readonly string[],
  targetOptions: readonly string[],
  draftEmpty: boolean,
): CheckboxToggleOutcome {
  const targetSet = new Set(targetOptions);
  const effectiveChecked = draftEmpty
    ? new Set<string>()
    : resolveCheckboxFilter(state, options).checkedSet;

  const allTargetChecked =
    targetOptions.length > 0 && targetOptions.every((o) => effectiveChecked.has(o));

  if (allTargetChecked) {
    const remaining = options.filter((o) => effectiveChecked.has(o) && !targetSet.has(o));
    if (remaining.length === 0) {
      return { draftEmpty: true };
    }
    if (state.mode === 'exclude') {
      const remainingSet = new Set(remaining);
      return {
        next: { mode: 'exclude', values: options.filter((o) => !remainingSet.has(o)) },
        draftEmpty: false,
      };
    }
    return { next: { mode: 'include', values: remaining }, draftEmpty: false };
  }

  const nextChecked = options.filter((o) => effectiveChecked.has(o) || targetSet.has(o));
  if (nextChecked.length >= options.length) {
    return { next: ALL_CHECKED, draftEmpty: false };
  }
  if (draftEmpty || state.mode === 'include') {
    return { next: { mode: 'include', values: nextChecked }, draftEmpty: false };
  }
  const nextCheckedSet = new Set(nextChecked);
  return {
    next: { mode: 'exclude', values: options.filter((o) => !nextCheckedSet.has(o)) },
    draftEmpty: false,
  };
}

export function reincludeCheckboxOption(
  state: CheckboxFilterState,
  options: readonly string[],
  opt: string,
): CheckboxFilterState {
  const { checked, excluded, excludedSet } = resolveCheckboxFilter(state, options);
  if (!excludedSet.has(opt)) {
    return checked.length >= options.length ? ALL_CHECKED : state;
  }
  if (checked.length + 1 >= options.length) {
    return ALL_CHECKED;
  }
  if (state.mode === 'exclude') {
    return { mode: 'exclude', values: excluded.filter((x) => x !== opt) };
  }
  const nextCheckedSet = new Set([...checked, opt]);
  return { mode: 'include', values: options.filter((o) => nextCheckedSet.has(o)) };
}

export function removeIncludedCheckboxOption(
  state: CheckboxFilterState,
  options: readonly string[],
  opt: string,
): CheckboxFilterState {
  const { checked, excluded, checkedSet } = resolveCheckboxFilter(state, options);
  if (!checkedSet.has(opt)) {
    return checked.length >= options.length ? ALL_CHECKED : state;
  }
  if (checked.length <= 1) {
    return ALL_CHECKED;
  }
  if (state.mode === 'include') {
    return { mode: 'include', values: checked.filter((x) => x !== opt) };
  }
  const nextExcludedSet = new Set([...excluded, opt]);
  return { mode: 'exclude', values: options.filter((o) => nextExcludedSet.has(o)) };
}

export function pruneCheckboxFilter(
  state: CheckboxFilterState,
  validOptions: readonly string[],
): CheckboxFilterState {
  if (state.values.length === 0 || validOptions.length === 0) return ALL_CHECKED;
  const validSet = new Set(validOptions);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const v of state.values) {
    if (validSet.has(v) && !seen.has(v)) {
      seen.add(v);
      kept.push(v);
    }
  }
  if (kept.length === 0 || kept.length >= validOptions.length) {
    return ALL_CHECKED;
  }
  return { mode: state.mode, values: kept };
}

export function isSameCheckboxFilterState(
  a: CheckboxFilterState,
  b: CheckboxFilterState,
): boolean {
  return (
    a.mode === b.mode &&
    a.values.length === b.values.length &&
    a.values.every((v, i) => v === b.values[i])
  );
}

export function summarizeNames(names: readonly string[], maxShown = 2): string {
  if (names.length <= maxShown) return names.join(', ');
  return `${names.slice(0, maxShown).join(', ')} +${names.length - maxShown} more`;
}
