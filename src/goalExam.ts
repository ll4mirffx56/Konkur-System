
export type StudyGoalSettings = {
  weeklyHours: number
  monthlyHours: number
}

export type ExamCounts = {
  total: number
  correct: number
  wrong: number
  blank: number
}

export type DailyStudyRecord = {
  date: string
  hours: number
}

export const DEFAULT_STUDY_GOALS: StudyGoalSettings = {
  weeklyHours: 35,
  monthlyHours: 150,
}

/**
 * Validate configurable study-hour targets.
 * Both values must be finite and within a practical range.
 */
export function validateStudyGoals(
  value: unknown,
): value is StudyGoalSettings {
  if (!value || typeof value !== 'object') return false

  const goals = value as Partial<StudyGoalSettings>

  return (
    typeof goals.weeklyHours === 'number' &&
    Number.isFinite(goals.weeklyHours) &&
    goals.weeklyHours >= 0 &&
    goals.weeklyHours <= 168 &&
    typeof goals.monthlyHours === 'number' &&
    Number.isFinite(goals.monthlyHours) &&
    goals.monthlyHours >= 0 &&
    goals.monthlyHours <= 744
  )
}

/**
 * Sum study hours for an inclusive ISO-date range.
 * Dates are compared as YYYY-MM-DD strings to avoid timezone shifts.
 */
export function sumStudyHoursInRange(
  records: DailyStudyRecord[],
  startDate: string,
  endDate: string,
): number {
  if (
    !isISODate(startDate) ||
    !isISODate(endDate) ||
    startDate > endDate
  ) {
    throw new RangeError('Invalid date range')
  }

  return records.reduce((sum, record) => {
    if (
      !isISODate(record.date) ||
      record.date < startDate ||
      record.date > endDate ||
      !Number.isFinite(record.hours) ||
      record.hours < 0
    ) {
      return sum
    }

    return sum + record.hours
  }, 0)
}

/**
 * Calculate exam percentage using the requested negative-marking formula:
 * 100 * (3 * correct - wrong) / (3 * total)
 */
export function calculateExamPercentage(
  counts: ExamCounts,
): number {
  validateExamCounts(counts)

  return (
    (100 * (3 * counts.correct - counts.wrong)) /
    (3 * counts.total)
  )
}

/**
 * Reject incomplete or inconsistent exam results.
 * Correct + wrong + blank must equal the total question count.
 */
export function validateExamCounts(counts: ExamCounts): void {
  const values = [
    counts.total,
    counts.correct,
    counts.wrong,
    counts.blank,
  ]

  if (
    values.some(
      value =>
        !Number.isInteger(value) ||
        value < 0,
    )
  ) {
    throw new RangeError(
      'Question counts must be non-negative integers',
    )
  }

  if (counts.total <= 0) {
    throw new RangeError(
      'Total question count must be greater than zero',
    )
  }

  if (
    counts.correct + counts.wrong + counts.blank !==
    counts.total
  ) {
    throw new RangeError(
      'Correct, wrong and blank counts must equal total',
    )
  }
}

function isISODate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  )
}
