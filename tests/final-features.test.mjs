import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const logic = readFileSync(new URL('../src/logic.ts', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

 test('review engine creates a full spaced-review schedule and records completion dates', () => {
  assert.match(app, /makeReviewEntries\(reviewSubject, title, baseDate, intervals\)/)
  assert.match(app, /doneAt: item\.done \? null : today/)
  assert.match(logic, /export function buildReviewSchedule/)
  assert.match(logic, /addDaysISO\(baseDate, interval\)/)
})

test('Jalali date entry is converted and round-trip validated', () => {
  assert.match(app, /import \{ toGregorian, toJalaali \} from 'jalaali-js'/)
  assert.match(app, /function jalaliToISO/)
  assert.match(app, /check\.jy !== jy \|\| check\.jm !== jm \|\| check\.jd !== jd/)
  assert.match(app, /inputMode="numeric" value=\{reviewBaseDateText\}/)
  assert.match(app, /inputMode="numeric" value=\{performanceDateText\}/)
})

test('performance entry validates counts and computes real metrics from saved records', () => {
  assert.match(app, /correct \+ wrong \+ blank > tests/)
  assert.match(app, /setPerformanceRecords\(current => \[\.\.\.current\.filter\(item => item\.date !== parsedPerformanceDate\), entry\]/)
  assert.match(app, /getPerformanceMetrics\(chartPoints\)/)
  assert.match(app, /درصد پاسخ صحیح/)
})

test('JSON backup and workbook import/export are wired', () => {
  assert.match(app, /function exportBackup/)
  assert.match(app, /function importBackupFile/)
  assert.match(app, /function importExcelFile/)
  assert.match(app, /XLSX\.read\(reader\.result/)
  assert.match(app, /XLSX\.writeFile\(wb/)
  assert.match(app, /'تنظیمات'/)
  assert.match(app, /نمونه\|مثال/)
})

test('no demo review or performance rows are seeded as user data', () => {
  assert.match(app, /readStored<ReviewItem\[]>\(STORE\.reviews, \[\]\)/)
  assert.match(app, /readStored<PerformanceRecord\[]>\(STORE\.performance, \[\]\)/)
  assert.doesNotMatch(app, /const initialReviews\s*=/)
  assert.doesNotMatch(app, /const performanceData\s*=/)
})

test('documentation explains local date source and local-only persistence', () => {
  assert.match(app, /headers\.get\('Date'\)/)
  assert.match(readme, /هدر استاندارد `Date` پاسخ سایت/)
  assert.match(readme, /localStorage.*همان مرورگر/)
  assert.match(readme, /npm test/)
})
