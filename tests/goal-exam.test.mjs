
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_STUDY_GOALS,
  validateStudyGoals,
  sumStudyHoursInRange,
  calculateExamPercentage,
  validateExamCounts,
} from '../.test-tmp/goalExam.js'

test('default study goals are 35 weekly and 150 monthly hours', () => {
  assert.deepEqual(DEFAULT_STUDY_GOALS, {
    weeklyHours: 35,
    monthlyHours: 150,
  })
})

test('study goals accept valid values and reject invalid values', () => {
  assert.equal(
    validateStudyGoals({ weeklyHours: 40, monthlyHours: 160 }),
    true,
  )
  assert.equal(
    validateStudyGoals({ weeklyHours: 0, monthlyHours: 0 }),
    true,
  )
  assert.equal(
    validateStudyGoals({ weeklyHours: 169, monthlyHours: 160 }),
    false,
  )
  assert.equal(
    validateStudyGoals({ weeklyHours: 40, monthlyHours: 745 }),
    false,
  )
  assert.equal(
    validateStudyGoals({ weeklyHours: -1, monthlyHours: 160 }),
    false,
  )
  assert.equal(
    validateStudyGoals({ weeklyHours: NaN, monthlyHours: 160 }),
    false,
  )
  assert.equal(validateStudyGoals(null), false)
})

test('study hours sum only valid records inside the inclusive date range', () => {
  const records = [
    { date: '2026-10-20', hours: 3 },
    { date: '2026-10-21', hours: 4.5 },
    { date: '2026-10-25', hours: 2 },
    { date: '2026-10-26', hours: 5 },
    { date: '2026-10-25', hours: -3 },
    { date: 'invalid', hours: 10 },
  ]

  assert.equal(
    sumStudyHoursInRange(records, '2026-10-21', '2026-10-25'),
    6.5,
  )
})

test('study-hour range rejects invalid or reversed dates', () => {
  assert.throws(
    () => sumStudyHoursInRange([], '2026-02-31', '2026-03-01'),
    RangeError,
  )
  assert.throws(
    () => sumStudyHoursInRange([], '2026-10-26', '2026-10-25'),
    RangeError,
  )
})

test('exam percentage follows the negative-marking formula', () => {
  assert.equal(
    calculateExamPercentage({
      total: 30,
      correct: 20,
      wrong: 5,
      blank: 5,
    }),
    (100 * (3 * 20 - 5)) / (3 * 30),
  )

  assert.equal(
    calculateExamPercentage({
      total: 10,
      correct: 0,
      wrong: 10,
      blank: 0,
    }),
    -100 / 3,
  )
})

test('exam results require valid counts that add up to the total', () => {
  assert.doesNotThrow(() =>
    validateExamCounts({
      total: 20,
      correct: 12,
      wrong: 5,
      blank: 3,
    }),
  )

  assert.throws(
    () => validateExamCounts({
      total: 0,
      correct: 0,
      wrong: 0,
      blank: 0,
    }),
    RangeError,
  )

  assert.throws(
    () => validateExamCounts({
      total: 20,
      correct: 12,
      wrong: 5,
      blank: 2,
    }),
    RangeError,
  )

  assert.throws(
    () => validateExamCounts({
      total: 20,
      correct: 12,
      wrong: -1,
      blank: 9,
    }),
    RangeError,
  )

  assert.throws(
    () => validateExamCounts({
      total: 20,
      correct: 12.5,
      wrong: 4,
      blank: 3.5,
    }),
    RangeError,
  )
})
