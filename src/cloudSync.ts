import type { SupabaseClient } from '@supabase/supabase-js'
import { addDaysISO, isValidISODate, type PanelKey } from './logic.js'
import { DEFAULT_STUDY_GOALS, validateStudyGoals, type StudyGoalSettings } from './goalExam.js'

export type CloudReviewItem = {
  id: string
  subject: string
  title: string
  stage: string
  stageIndex: number
  interval: number
  baseDate: string
  dueDate: string
  done: boolean
  doneAt: string | null
  tone: string
}

export type CloudPerformanceRecord = {
  id: string
  date: string
  hours: number
  planned: number
  tests: number
  correct: number
  wrong: number
  blank: number
  focus: number
}

export type CompleteCloudPayload = {
  version: 1
  reviews: CloudReviewItem[]
  performance: CloudPerformanceRecord[]
  intervals: number[]
  theme: 'dark' | 'light'
  panelOrder: PanelKey[]
  reduceMotion: boolean
  studyGoals: StudyGoalSettings
}

export type CloudStateRow = {
  payload: unknown
  updated_at: string
}

const DEFAULT_INTERVALS = [1, 3, 7, 30, 90]
const DEFAULT_PANEL_ORDER: PanelKey[] = ['weekly', 'goal', 'reviews', 'quick']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function normalizePerformanceRecords(value: unknown): CloudPerformanceRecord[] | null {
  if (!Array.isArray(value)) return null
  const seenIds = new Set<string>()
  const seenDates = new Set<string>()
  const result: CloudPerformanceRecord[] = []

  for (const raw of value) {
    if (!isRecord(raw)) return null
    const { id, date, hours, planned, tests, correct, wrong, blank, focus } = raw
    if (
      typeof id !== 'string' || !id || seenIds.has(id) ||
      typeof date !== 'string' || !isValidISODate(date) || seenDates.has(date) ||
      typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours > 24 ||
      typeof planned !== 'number' || !Number.isFinite(planned) || planned < 0 || planned > 24 ||
      !isNonNegativeInteger(tests) ||
      !isNonNegativeInteger(correct) ||
      !isNonNegativeInteger(wrong) ||
      !isNonNegativeInteger(blank) ||
      typeof focus !== 'number' || !Number.isInteger(focus) || focus < 0 || focus > 10
    ) return null

    const answered = correct + wrong + blank
    if (answered > tests) return null
    // Older versions allowed unanswered questions to remain unclassified.
    // Treat the remaining questions as blank so old data stays usable and the formula remains valid.
    result.push({
      id,
      date,
      hours,
      planned,
      tests,
      correct,
      wrong,
      blank: blank + (tests - answered),
      focus,
    })
    seenIds.add(id)
    seenDates.add(date)
  }
  return result
}

function normalizeReviews(value: unknown): CloudReviewItem[] | null {
  if (!Array.isArray(value)) return null
  const seenIds = new Set<string>()
  const result: CloudReviewItem[] = []
  for (const raw of value) {
    if (!isRecord(raw)) return null
    const { id, subject, title, stage, stageIndex, interval, baseDate, dueDate, done, doneAt, tone } = raw
    if (
      typeof id !== 'string' || !id || seenIds.has(id) ||
      typeof subject !== 'string' || !subject.trim() ||
      typeof title !== 'string' || !title.trim() ||
      typeof stage !== 'string' ||
      !Number.isInteger(stageIndex) || Number(stageIndex) < 0 || Number(stageIndex) >= DEFAULT_INTERVALS.length ||
      !Number.isInteger(interval) || Number(interval) < 1 || Number(interval) > 365 ||
      typeof baseDate !== 'string' || !isValidISODate(baseDate) ||
      typeof dueDate !== 'string' || !isValidISODate(dueDate) || dueDate !== addDaysISO(baseDate, Number(interval)) ||
      typeof done !== 'boolean' ||
      !(doneAt === null || (typeof doneAt === 'string' && isValidISODate(doneAt))) ||
      typeof tone !== 'string'
    ) return null
    result.push({
      id, subject, title, stage, stageIndex: Number(stageIndex), interval: Number(interval),
      baseDate, dueDate, done, doneAt: doneAt == null ? null : doneAt as string, tone,
    })
    seenIds.add(id)
  }
  return result
}

function normalizeIntervals(value: unknown): number[] {
  return Array.isArray(value) &&
    value.length === DEFAULT_INTERVALS.length &&
    value.every(item => Number.isInteger(item) && item > 0 && item <= 365) &&
    new Set(value).size === value.length
    ? [...value] as number[]
    : [...DEFAULT_INTERVALS]
}

export function normalizeCloudPayload(value: unknown): CompleteCloudPayload | null {
  if (!isRecord(value) || value.version !== 1) return null
  const reviews = normalizeReviews(value.reviews)
  const performance = normalizePerformanceRecords(value.performance)
  if (!reviews || !performance) return null

  const order = value.panelOrder
  const panelOrder = Array.isArray(order) && order.length === DEFAULT_PANEL_ORDER.length &&
    order.every(item => DEFAULT_PANEL_ORDER.includes(item as PanelKey)) && new Set(order).size === order.length
    ? [...order] as PanelKey[]
    : [...DEFAULT_PANEL_ORDER]

  return {
    version: 1,
    reviews,
    performance,
    intervals: normalizeIntervals(value.intervals),
    theme: value.theme === 'light' ? 'light' : 'dark',
    panelOrder,
    reduceMotion: typeof value.reduceMotion === 'boolean' ? value.reduceMotion : false,
    studyGoals: validateStudyGoals(value.studyGoals) ? value.studyGoals : { ...DEFAULT_STUDY_GOALS },
  }
}

function samePayload(a: CompleteCloudPayload, b: CompleteCloudPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

type Identified = { id: string }
function mergeIdentified<T extends Identified>(base: T[], local: T[], remote: T[]): T[] {
  const baseMap = new Map(base.map(item => [item.id, item]))
  const localMap = new Map(local.map(item => [item.id, item]))
  const remoteMap = new Map(remote.map(item => [item.id, item]))
  const order = [...new Set([...remote.map(item => item.id), ...local.map(item => item.id), ...base.map(item => item.id)])]
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const result: T[] = []

  for (const id of order) {
    const baseValue = baseMap.get(id)
    const localValue = localMap.get(id)
    const remoteValue = remoteMap.get(id)
    const localChanged = !equal(localValue, baseValue)
    const remoteChanged = !equal(remoteValue, baseValue)
    const chosen = !localChanged ? remoteValue : !remoteChanged || equal(localValue, remoteValue) ? localValue : localValue
    if (chosen) result.push(chosen)
  }
  return result
}

export function mergeCloudPayloads(
  base: CompleteCloudPayload,
  local: CompleteCloudPayload,
  remote: CompleteCloudPayload,
): CompleteCloudPayload {
  const changed = <T,>(current: T, previous: T) => JSON.stringify(current) !== JSON.stringify(previous)
  return {
    version: 1,
    reviews: mergeIdentified(base.reviews, local.reviews, remote.reviews),
    performance: mergeIdentified(base.performance, local.performance, remote.performance),
    intervals: changed(local.intervals, base.intervals) ? local.intervals : remote.intervals,
    theme: changed(local.theme, base.theme) ? local.theme : remote.theme,
    panelOrder: changed(local.panelOrder, base.panelOrder) ? local.panelOrder : remote.panelOrder,
    reduceMotion: changed(local.reduceMotion, base.reduceMotion) ? local.reduceMotion : remote.reduceMotion,
    studyGoals: {
      weeklyHours: local.studyGoals.weeklyHours !== base.studyGoals.weeklyHours ? local.studyGoals.weeklyHours : remote.studyGoals.weeklyHours,
      monthlyHours: local.studyGoals.monthlyHours !== base.studyGoals.monthlyHours ? local.studyGoals.monthlyHours : remote.studyGoals.monthlyHours,
    },
  }
}

export function makeEmptyCloudPayload(): CompleteCloudPayload {
  return {
    version: 1,
    reviews: [],
    performance: [],
    intervals: [...DEFAULT_INTERVALS],
    theme: 'dark',
    panelOrder: [...DEFAULT_PANEL_ORDER],
    reduceMotion: false,
    studyGoals: { ...DEFAULT_STUDY_GOALS },
  }
}

/**
 * Persist a candidate state with compare-and-swap. The SQL RPC updates only if
 * updated_at still matches the row version we just read; concurrent writes are
 * merged and retried instead of blindly overwriting the other device.
 */
export async function saveCloudStateSafely(
  client: SupabaseClient,
  userId: string,
  candidateInput: CompleteCloudPayload,
  baselineInput: CompleteCloudPayload,
  maxAttempts = 6,
): Promise<{ payload: CompleteCloudPayload; updatedAt: string }> {
  let candidate = candidateInput
  let baseline = baselineInput

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: currentRow, error: readError } = await client
      .from('user_app_state')
      .select('payload, updated_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (readError) throw readError

    const remote = currentRow ? normalizeCloudPayload(currentRow.payload) : null
    if (currentRow && !remote) throw new Error('ساختار اطلاعات ابری معتبر نیست؛ برای جلوگیری از حذف داده‌ها همگام‌سازی متوقف شد.')

    const merged = remote ? mergeCloudPayloads(baseline, candidate, remote) : candidate
    if (remote && samePayload(merged, remote)) {
      return { payload: remote, updatedAt: currentRow.updated_at }
    }

    const { data, error } = await client.rpc('save_user_app_state', {
      p_payload: merged,
      p_expected_updated_at: currentRow?.updated_at ?? null,
    })
    if (error) {
      throw new Error(`تابع ذخیرهٔ امن در Supabase در دسترس نیست یا خطا داده است: ${error.message}`)
    }
    const result = Array.isArray(data) ? data[0] : data
    if (result?.saved === true) {
      const saved = normalizeCloudPayload(result.current_payload)
      if (!saved) throw new Error('پاسخ ذخیره‌سازی ابری ساختار معتبر ندارد؛ برای حفظ داده‌ها همگام‌سازی متوقف شد.')
      const updatedAt = typeof result.current_updated_at === 'string' ? result.current_updated_at : new Date().toISOString()
      return { payload: saved, updatedAt }
    }

    const latest = normalizeCloudPayload(result?.current_payload)
    if (!latest) {
      // The row may have disappeared between the read and RPC. Retry an insert.
      baseline = makeEmptyCloudPayload()
      candidate = merged
    } else {
      baseline = remote ?? makeEmptyCloudPayload()
      candidate = merged
    }
  }

  throw new Error('اطلاعات هم‌زمان از دستگاه دیگری تغییر کرده است؛ همگام‌سازی پس از چند تلاش ناموفق متوقف شد. دوباره تلاش کن.')
}
