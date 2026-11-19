import { describe, expect, it } from 'vitest';
import {
  ALL_CHECKED,
  isSameCheckboxFilterState,
  pruneCheckboxFilter,
  reincludeCheckboxOption,
  removeIncludedCheckboxOption,
  resolveCheckboxFilter,
  selectOnlyCheckboxOption,
  summarizeNames,
  toggleAllCheckboxOptions,
  toggleCheckboxOption,
} from './checkboxFilter';

const OPTS = ['A', 'B', 'C', 'D', 'E'];

describe('checkboxFilter state engine', () => {
  it('resolves ALL_CHECKED to all options checked, inactive, and displayMode=all', () => {
    const res = resolveCheckboxFilter(ALL_CHECKED, OPTS);
    expect(res.checked).toEqual(OPTS);
    expect(res.excluded).toEqual([]);
    expect(res.isActive).toBe(false);
    expect(res.displayMode).toBe('all');
  });

  it('unchecking 1 option enters exclude mode, and re-checking returns to ALL_CHECKED', () => {
    const step1 = toggleCheckboxOption(ALL_CHECKED, OPTS, 'B', false);
    expect(step1.draftEmpty).toBe(false);
    expect(step1.next).toEqual({ mode: 'exclude', values: ['B'] });

    const r1 = resolveCheckboxFilter(step1.next!, OPTS);
    expect(r1.checked).toEqual(['A', 'C', 'D', 'E']);
    expect(r1.excluded).toEqual(['B']);
    expect(r1.isActive).toBe(true);
    expect(r1.displayMode).toBe('exclude');

    const step2 = toggleCheckboxOption(step1.next!, OPTS, 'B', false);
    expect(step2.draftEmpty).toBe(false);
    expect(step2.next).toEqual(ALL_CHECKED);
  });

  it('enters draftEmpty when unchecking the last checked option and commits when picking 1 option', () => {
    const onlyA = selectOnlyCheckboxOption(OPTS, 'A');
    expect(onlyA).toEqual({ mode: 'include', values: ['A'] });

    const cleared = toggleCheckboxOption(onlyA, OPTS, 'A', false);
    expect(cleared.draftEmpty).toBe(true);
    expect(cleared.next).toBeUndefined();

    const picked = toggleCheckboxOption(onlyA, OPTS, 'C', true);
    expect(picked.draftEmpty).toBe(false);
    expect(picked.next).toEqual({ mode: 'include', values: ['C'] });

    // Single-option list normalizes to ALL_CHECKED
    expect(selectOnlyCheckboxOption(['OnlyOne'], 'OnlyOne')).toEqual(ALL_CHECKED);
    const fromDraftSingle = toggleCheckboxOption(ALL_CHECKED, ['OnlyOne'], 'OnlyOne', true);
    expect(fromDraftSingle.next).toEqual(ALL_CHECKED);
  });

  it('toggleAllCheckboxOptions handles full unselect/select and filtered subset toggling', () => {
    // Unselecting all options enters draftEmpty without emitting next
    const unselectAll = toggleAllCheckboxOptions(ALL_CHECKED, OPTS, OPTS, false);
    expect(unselectAll.draftEmpty).toBe(true);
    expect(unselectAll.next).toBeUndefined();

    // Selecting all from draftEmpty returns ALL_CHECKED
    const reselectAll = toggleAllCheckboxOptions({ mode: 'include', values: ['A'] }, OPTS, OPTS, true);
    expect(reselectAll.draftEmpty).toBe(false);
    expect(reselectAll.next).toEqual(ALL_CHECKED);

    // Filtered subset: uncheck only matching ['B', 'C']
    const uncheckSubset = toggleAllCheckboxOptions(ALL_CHECKED, OPTS, ['B', 'C'], false);
    expect(uncheckSubset.draftEmpty).toBe(false);
    expect(uncheckSubset.next).toEqual({ mode: 'exclude', values: ['B', 'C'] });

    // Filtered subset: re-check only ['B', 'C'] back to ALL_CHECKED
    const checkSubset = toggleAllCheckboxOptions(uncheckSubset.next!, OPTS, ['B', 'C'], false);
    expect(checkSubset.draftEmpty).toBe(false);
    expect(checkSubset.next).toEqual(ALL_CHECKED);

    // Filtered subset: unchecking the only checked items enters draftEmpty
    const onlyBC = { mode: 'include' as const, values: ['B', 'C'] };
    const clearSubset = toggleAllCheckboxOptions(onlyBC, OPTS, ['B', 'C'], false);
    expect(clearSubset.draftEmpty).toBe(true);
    expect(clearSubset.next).toBeUndefined();
  });

  it('switches displayMode between exclude and include based on majority checked', () => {
    // 4 checked vs 1 excluded -> exclude
    expect(resolveCheckboxFilter({ mode: 'exclude', values: ['A'] }, OPTS).displayMode).toBe('exclude');
    // 3 checked vs 2 excluded -> exclude
    expect(resolveCheckboxFilter({ mode: 'exclude', values: ['A', 'B'] }, OPTS).displayMode).toBe('exclude');
    // 2 checked vs 3 excluded -> include
    expect(resolveCheckboxFilter({ mode: 'exclude', values: ['A', 'B', 'C'] }, OPTS).displayMode).toBe('include');
    // 2 checked vs 2 excluded (4 options) -> half or fewer -> include
    expect(
      resolveCheckboxFilter({ mode: 'exclude', values: ['A', 'B'] }, ['A', 'B', 'C', 'D']).displayMode,
    ).toBe('include');
    // 3 checked vs 1 excluded (4 options) in include mode -> exclude
    expect(
      resolveCheckboxFilter({ mode: 'include', values: ['A', 'B', 'C'] }, ['A', 'B', 'C', 'D']).displayMode,
    ).toBe('exclude');
  });

  it('supports reincludeCheckboxOption and removeIncludedCheckboxOption', () => {
    const excl2 = { mode: 'exclude' as const, values: ['A', 'B'] };
    expect(reincludeCheckboxOption(excl2, OPTS, 'A')).toEqual({ mode: 'exclude', values: ['B'] });
    expect(reincludeCheckboxOption({ mode: 'exclude', values: ['B'] }, OPTS, 'B')).toEqual(ALL_CHECKED);

    const incl2 = { mode: 'include' as const, values: ['A', 'B'] };
    expect(removeIncludedCheckboxOption(incl2, OPTS, 'A')).toEqual({ mode: 'include', values: ['B'] });
    // Removing the last included chip resets to ALL_CHECKED
    expect(removeIncludedCheckboxOption({ mode: 'include', values: ['B'] }, OPTS, 'B')).toEqual(
      ALL_CHECKED,
    );
  });

  it('preserves sticky exclude/include intent and normalizes edge cases on pruneCheckboxFilter', () => {
    // Sticky exclusion across widened options (newly added 'F' starts checked)
    const exclB = { mode: 'exclude' as const, values: ['B'] };
    expect(pruneCheckboxFilter(exclB, ['A', 'B', 'C', 'F'])).toEqual({
      mode: 'exclude',
      values: ['B'],
    });

    // Drops out-of-scope excluded item -> returns ALL_CHECKED
    expect(pruneCheckboxFilter(exclB, ['A', 'C'])).toEqual(ALL_CHECKED);

    // Excluded covers all valid options -> resets to ALL_CHECKED
    expect(pruneCheckboxFilter({ mode: 'exclude', values: ['A', 'B'] }, ['A', 'B'])).toEqual(
      ALL_CHECKED,
    );

    // Sticky inclusion across scope changes
    const inclB = { mode: 'include' as const, values: ['B'] };
    expect(pruneCheckboxFilter(inclB, ['A', 'B', 'F'])).toEqual({
      mode: 'include',
      values: ['B'],
    });

    // Inclusion covers all valid options -> resets to ALL_CHECKED
    expect(pruneCheckboxFilter({ mode: 'include', values: ['A', 'B'] }, ['A', 'B'])).toEqual(
      ALL_CHECKED,
    );

    // Inclusion drops to 0 valid options -> resets to ALL_CHECKED
    expect(pruneCheckboxFilter(inclB, ['A', 'C'])).toEqual(ALL_CHECKED);
  });

  it('compares filter states structurally and formats name summaries', () => {
    expect(isSameCheckboxFilterState(ALL_CHECKED, { mode: 'exclude', values: [] })).toBe(true);
    expect(
      isSameCheckboxFilterState({ mode: 'exclude', values: ['A'] }, { mode: 'include', values: ['A'] }),
    ).toBe(false);
    expect(summarizeNames(['A', 'B'])).toBe('A, B');
    expect(summarizeNames(['A', 'B', 'C', 'D'])).toBe('A, B +2 more');
  });
});
