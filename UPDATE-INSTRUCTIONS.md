# Moroor V2 – Date and Daily Performance Update

Apply this patch to the `v2-dev` branch only.

## Replace these exact files

- `src/App.tsx`
- `src/cloudSync.ts`
- `src/styles.css`
- `tests/cloud-sync.test.mjs`
- `tests/final-features.test.mjs`

Keep the directory paths exactly as shown. Do not replace the entire repository, and do not modify `main`.

## What changed

- Jalali years are rendered without thousands separators (e.g. `۱۴۰۵`, not `۱,۴۰۵`). The parser also accepts legacy grouped year strings.
- Daily performance keeps one record per day, with separate exam counts for each subject or one `همه درس‌ها` aggregate row.
- The unanswered count is derived automatically as `total - correct - wrong`; there is no unanswered input field.
- Each subject's negative-marking percentage is calculated independently using `((correct * 3) - wrong) / (total * 3) * 100`.
- Previous performance records are normalized into the new structure when loaded, including existing local and cloud data.
- Concurrent additions for different subjects on the same date are merged independently across devices.
- Excel export/import supports the new subject-level format and continues to accept the older format.

## Apply and verify

1. In GitHub, open the `v2-dev` branch.
2. Upload and replace the five files above, preserving their folder paths.
3. Commit directly to `v2-dev`.
4. Open Actions and verify `npm test` and `npm run build` both pass.

No Supabase SQL migration is required. This update changes the JSON payload structure handled by the application and keeps compatibility with older records. Do not rerun existing migrations.

## Local verification performed

- `npm test`: 49/49 tests passed.
- App and cloud-sync source syntax/transpilation checks passed.
- A strict internal TypeScript check with temporary dependency declarations passed. A full Vite build was not run in this environment because dependency installation timed out; the GitHub Actions build must verify the real dependency/type environment.
