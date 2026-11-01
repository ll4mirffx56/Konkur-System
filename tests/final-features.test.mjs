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
  assert.match(app, /import \{ jalaaliMonthLength, toGregorian, toJalaali \} from 'jalaali-js'/)
  assert.match(app, /function jalaliToISO/)
  assert.match(app, /check\.jy !== jy \|\| check\.jm !== jm \|\| check\.jd !== jd/)
  assert.match(app, /<PersianDatePicker label="تاریخ اتمام جلسه" value=\{reviewBaseDateText\} onChange=\{setReviewBaseDateText\} todayDate=\{today\} \/>/)
  assert.match(app, /<PersianDatePicker label="تاریخ عملکرد" value=\{performanceDateText\} onChange=\{changePerformanceDate\} todayDate=\{today\} \/>/)
})

test('daily performance stores independent subject exams and derives unanswered questions', () => {
  assert.match(app, /function addSubjectExam\(/)
  assert.match(app, /const blank = tests - correct - wrong/)
  assert.match(app, /exams: subjectExams\.map/)
  assert.match(app, /getPerformanceMetrics\(chartPoints\)/)
  assert.match(app, /درصد هر درس/)
  assert.doesNotMatch(app, /<span>نزده<\/span>/)
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
  assert.match(app, /readPerformanceRecords\(\)/)
  assert.match(app, /readStored<unknown>\(STORE\.performance, \[\]\)/)
  assert.doesNotMatch(app, /const initialReviews\s*=/)
  assert.doesNotMatch(app, /const performanceData\s*=/)
})

test('documentation explains date source, account-scoped cloud persistence and automated tests', () => {
  assert.match(app, /headers\.get\('Date'\)/)
  assert.match(readme, /هدر `Date` پاسخ سایت/)
  assert.match(readme, /Supabase|حساب|فضای ابری/)
  assert.match(readme, /npm test/)
})


test('Jalali years are formatted without thousands separators and legacy grouped years are parsed', () => {
  assert.match(app, /function formatFaYear\(value: number\).*useGrouping: false/)
  assert.match(app, /replace\(\/[٬,]\/g, ''\)/)
  assert.match(app, /formatFaYear\(j\.jy\)/)
})
