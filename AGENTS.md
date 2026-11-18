# Project Rules â€” Sales Growth Analyzer

## Keep documentation in sync after EVERY change

After any change to the project (code, config, data pipeline, scripts, styling,
dependencies, or behavior), and before reporting the task as done, you MUST
update both files in the same turn:

1. **`worklog.md`**
   - Update the `**Last Updated**:` date to today's date (YYYY-MM-DD).
   - Update the `**Status**:` line with the latest verification results
     (`tsc --noEmit`, Vitest, `npm run build`) if they were run.
   - Add a new dated subsection under "Summary of Recent Improvements",
     continuing the existing numbering (e.g. `### 1.N <Title> (YYYY-MM-DD)`),
     with concise bullets: what changed, why, and the files touched
     (backtick file paths).

2. **`README.md`**
   - Reflect any change to features, architecture, metrics/definitions,
     configuration, scripts/commands, setup steps, or UI behavior.
   - Remove or correct anything the change made outdated.
   - If the change has no user/developer-facing effect (e.g. a pure internal
     refactor), README edits may be skipped â€” but say so explicitly in the
     worklog entry ("README: no changes needed").

Follow the existing style and structure of each file; do not rewrite unrelated
sections. Mention in the final response that both files were updated.

