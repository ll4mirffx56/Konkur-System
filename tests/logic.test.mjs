import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesReviewFilters, reorderPanels, filterCommandItems, getPerformanceMetrics, createLineChartGeometry } from '../.test-tmp/logic.js'

const review = { subject: 'شیمی', title: 'استوکیومتری — جلسه ۸', stage: 'مرور ۷ روزه', dueDays: 0, done: false }
const noFilters = { query: '', subject: 'همهٔ درس‌ها', due: 'همهٔ موعدها', status: 'همه' }

test('search matches subject/title/stage and ignores surrounding whitespace', () => {
  assert.equal(matchesReviewFilters(review, { ...noFilters, query: '  استوکیومتری  ' }), true)
  assert.equal(matchesReviewFilters(review, { ...noFilters, query: 'فیزیک' }), false)
})

test('review filters combine subject, due date and completion state', () => {
  assert.equal(matchesReviewFilters(review, { ...noFilters, subject: 'شیمی', due: 'امروز', status: 'انجام‌نشده' }), true)
  assert.equal(matchesReviewFilters(review, { ...noFilters, subject: 'فیزیک' }), false)
  assert.equal(matchesReviewFilters({ ...review, dueDays: -1 }, { ...noFilters, due: 'عقب‌افتاده' }), true)
  assert.equal(matchesReviewFilters({ ...review, dueDays: -1, done: true }, { ...noFilters, due: 'عقب‌افتاده' }), false)
  assert.equal(matchesReviewFilters({ ...review, dueDays: 2 }, { ...noFilters, due: 'آینده' }), true)
  assert.equal(matchesReviewFilters({ ...review, done: true }, { ...noFilters, status: 'انجام‌نشده' }), false)
})

test('reorder moves a panel before the target without mutating input', () => {
  const order = ['weekly', 'goal', 'reviews', 'quick']
  const next = reorderPanels(order, 'quick', 'goal')
  assert.deepEqual(next, ['weekly', 'quick', 'goal', 'reviews'])
  assert.deepEqual(order, ['weekly', 'goal', 'reviews', 'quick'])
  assert.deepEqual(reorderPanels(order, 'reviews', 'reviews'), order)
  assert.deepEqual(reorderPanels(order, 'unknown', 'goal'), order)
})

test('command palette filters labels, descriptions, and keywords; blank query returns all', () => {
  const commands = [
    { label: 'رفتن به داشبورد', description: 'ناوبری', keywords: 'home dashboard' },
    { label: 'فعال‌کردن تم روشن', description: 'ظاهر', keywords: 'theme light' },
  ]
  assert.equal(filterCommandItems(commands, '').length, 2)
  assert.equal(filterCommandItems(commands, 'روشن').length, 1)
  assert.equal(filterCommandItems(commands, 'dashboard').length, 1)
  assert.equal(filterCommandItems(commands, 'ناموجود').length, 0)
})

test('performance metrics handle ordinary data, empty data and zero planned hours', () => {
  const result = getPerformanceMetrics([
    { hours: 4, planned: 5, tests: 20, correct: 15 },
    { hours: 6, planned: 5, tests: 30, correct: 21 },
  ])
  assert.equal(result.hours, 10)
  assert.equal(result.tests, 50)
  assert.equal(result.averageHours, 5)
  assert.equal(result.accuracy, 72)
  assert.equal(result.planExecution, 100)
  assert.equal(result.testsPerHour, 5)
  assert.equal(result.averageFocus, 0)
  assert.deepEqual(getPerformanceMetrics([]), { hours: 0, tests: 0, averageHours: 0, accuracy: 0, testsPerHour: 0, averageFocus: 0, planExecution: 0 })
  assert.equal(getPerformanceMetrics([{ hours: 10, planned: 8, tests: 20, correct: 15, focus: 8 }]).planExecution, 125)
  assert.equal(getPerformanceMetrics([{ hours: 10, planned: 8, tests: 20, correct: 15, focus: 8 }]).averageFocus, 8)
  assert.equal(getPerformanceMetrics([{ hours: 2, planned: 0, tests: 0, correct: 0 }]).planExecution, 0)
})

test('line chart geometry stays in plot bounds and handles a single point', () => {
  const chart = createLineChartGeometry([2, 5, 3])
  assert.equal(chart.coords.length, 3)
  assert.ok(chart.coords.every(point => point.x >= 26 && point.x <= 774 && point.y >= 20 && point.y <= 220))
  assert.match(chart.line, /^M /)
  assert.match(chart.area, /Z$/)
  const single = createLineChartGeometry([7])
  assert.equal(single.coords.length, 1)
  assert.ok(single.coords[0].x >= 0 && single.coords[0].y >= 0)
  const empty = createLineChartGeometry([])
  assert.equal(empty.coords.length, 0)
  assert.equal(empty.area, '')
})

test('date arithmetic crosses month, year, and leap-day boundaries correctly', async () => {
  const { addDaysISO, daysUntilISO, buildReviewSchedule } = await import('../.test-tmp/logic.js')
  assert.equal(addDaysISO('2026-10-31', 1), '2026-11-01')
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01')
  assert.equal(addDaysISO('2024-02-28', 1), '2024-02-29')
  assert.equal(addDaysISO('2024-02-29', 1), '2024-03-01')
  assert.equal(daysUntilISO('2026-10-28', '2026-10-27'), 1)
  assert.equal(daysUntilISO('2026-10-26', '2026-10-27'), -1)
  assert.equal(daysUntilISO('2026-10-27', '2026-10-27'), 0)
  assert.deepEqual(buildReviewSchedule('2026-10-27', [1, 3, 7]), [
    { stageIndex: 0, interval: 1, dueDate: '2026-10-28' },
    { stageIndex: 1, interval: 3, dueDate: '2026-10-30' },
    { stageIndex: 2, interval: 7, dueDate: '2026-11-03' },
  ])
  assert.throws(() => buildReviewSchedule('2026-10-27', [1, 1]), /unique/)
  assert.throws(() => buildReviewSchedule('2026-10-27', [0]), /intervals/)
})

test('date arithmetic rejects impossible calendar dates instead of silently normalizing them', async () => {
  const { addDaysISO, daysUntilISO, buildReviewSchedule } = await import('../.test-tmp/logic.js')
  assert.throws(() => addDaysISO('2026-02-31', 1), /Invalid ISO date/)
  assert.throws(() => daysUntilISO('2026-13-01', '2026-10-27'), /Invalid ISO date/)
  assert.throws(() => buildReviewSchedule('2026-02-31', [1]), /base date/)
})
