import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateExamPercentage, validateExamCounts, validateStudyGoals, sumStudyHoursInRange } from '../.test-tmp/goalExam.js'

test('validates weekly and monthly study goals and rejects out-of-range values', () => {
  assert.equal(validateStudyGoals({ weeklyHours: 35, monthlyHours: 150 }), true)
  assert.equal(validateStudyGoals({ weeklyHours: 169, monthlyHours: 150 }), false)
  assert.equal(validateStudyGoals({ weeklyHours: 35, monthlyHours: -1 }), false)
  assert.equal(validateStudyGoals(null), false)
})

test('sums hours only inside an inclusive valid ISO date range', () => {
  assert.equal(sumStudyHoursInRange([{ date: '2026-10-01', hours: 2 }, { date: '2026-10-02', hours: 3 }, { date: '2026-10-03', hours: 9 }], '2026-10-01', '2026-10-02'), 5)
  assert.throws(() => sumStudyHoursInRange([], '2026-02-30', '2026-03-01'), RangeError)
})

test('applies the requested 3-to-1 negative-marking exam formula', () => {
  assert.equal(calculateExamPercentage({ total: 40, correct: 30, wrong: 7, blank: 3 }), ((30 * 3 - 7) / (40 * 3)) * 100)
  assert.ok(Math.abs(calculateExamPercentage({ total: 10, correct: 0, wrong: 10, blank: 0 }) - (-100 / 3)) < 1e-10)
  assert.throws(() => calculateExamPercentage({ total: 0, correct: 0, wrong: 0, blank: 0 }), RangeError)
  assert.throws(() => validateExamCounts({ total: 10, correct: 5, wrong: 2, blank: 1 }), RangeError)
})
