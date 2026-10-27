export type ReviewLike = {
  subject: string
  title: string
  stage: string
  dueDays: number
  done: boolean
}

export type ReviewFilters = {
  query: string
  subject: string
  due: string
  status: string
}

export type PanelKey = 'weekly' | 'goal' | 'reviews' | 'quick'

export type PerformancePointLike = {
  hours: number
  planned: number
  tests: number
  correct: number
  focus?: number
}

export type CommandLike = { label: string; description: string; keywords: string }

export function matchesReviewFilters(item: ReviewLike, filters: ReviewFilters): boolean {
  const searchable = `${item.subject} ${item.title} ${item.stage}`.toLocaleLowerCase('fa')
  const query = filters.query.trim().toLocaleLowerCase('fa')
  if (query && !searchable.includes(query)) return false
  if (filters.subject !== 'همهٔ درس‌ها' && item.subject !== filters.subject) return false
  if (filters.status === 'انجام‌نشده' && item.done) return false
  if (filters.status === 'انجام‌شده' && !item.done) return false
  if (filters.due === 'امروز' && (item.dueDays !== 0 || item.done)) return false
  if (filters.due === 'عقب‌افتاده' && (item.dueDays >= 0 || item.done)) return false
  if (filters.due === 'آینده' && (item.dueDays <= 0 || item.done)) return false
  return true
}

/** Insert source before target. The returned array is new; input order is never mutated. */
export function reorderPanels(order: PanelKey[], source: PanelKey, target: PanelKey): PanelKey[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return [...order]
  const next = order.filter(key => key !== source)
  const targetIndex = next.indexOf(target)
  next.splice(targetIndex < 0 ? next.length : targetIndex, 0, source)
  return next
}

export function filterCommandItems<T extends CommandLike>(items: T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase('fa')
  if (!normalized) return items
  return items.filter(item => `${item.label} ${item.description} ${item.keywords}`.toLocaleLowerCase('fa').includes(normalized))
}

export function sumHours(points: PerformancePointLike[]): number {
  return points.reduce((sum, point) => sum + point.hours, 0)
}

export function sumTests(points: PerformancePointLike[]): number {
  return points.reduce((sum, point) => sum + point.tests, 0)
}

export function getPerformanceMetrics(points: PerformancePointLike[]) {
  const hours = sumHours(points)
  const tests = sumTests(points)
  const correct = points.reduce((sum, point) => sum + point.correct, 0)
  const plannedRatios = points.filter(point => point.planned > 0).map(point => point.hours / point.planned)
  const planExecution = plannedRatios.length
    ? plannedRatios.reduce((sum, ratio) => sum + ratio, 0) / plannedRatios.length * 100
    : 0
  const focus = points.reduce((sum, point) => sum + (typeof point.focus === 'number' ? point.focus : 0), 0)
  const focusCount = points.filter(point => typeof point.focus === 'number').length
  return {
    hours,
    tests,
    averageHours: points.length ? hours / points.length : 0,
    accuracy: tests > 0 ? correct / tests * 100 : 0,
    testsPerHour: hours > 0 ? tests / hours : 0,
    averageFocus: focusCount ? focus / focusCount : 0,
    planExecution,
  }
}

export type ChartCoordinate = { x: number; y: number; value: number }
export type LineChartGeometry = { coords: ChartCoordinate[]; line: string; area: string; max: number; min: number }

export function createLineChartGeometry(values: number[], width = 800, height = 240, padX = 26, padY = 20): LineChartGeometry {
  const max = Math.max(1, ...values) * 1.12
  const min = Math.min(0, ...values)
  const plotW = width - 2 * padX
  const plotH = height - 2 * padY
  const coords = values.map((value, index) => ({
    x: padX + (values.length < 2 ? 0 : index / (values.length - 1)) * plotW,
    y: height - padY - ((value - min) / (max - min || 1)) * plotH,
    value,
  }))
  const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  const area = coords.length
    ? `${line} L ${coords[coords.length - 1].x} ${height - padY} L ${coords[0].x} ${height - padY} Z`
    : ''
  return { coords, line, area, max, min }
}

export function isValidISODate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
}

/** Calendar-safe ISO date arithmetic; all calculations are performed on UTC day boundaries. */
export function addDaysISO(isoDate: string, days: number): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match || !isValidISODate(isoDate) || !Number.isInteger(days)) throw new RangeError('Invalid ISO date or day offset')
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days))
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date')
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

/** Positive means dueDate is in the future; negative means it is overdue. */
export function daysUntilISO(dueDate: string, today: string): number {
  const date = (value: string) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match || !isValidISODate(value)) throw new RangeError('Invalid ISO date')
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }
  return Math.round((date(dueDate) - date(today)) / 86400000)
}

export function buildReviewSchedule(baseDate: string, intervals: number[]): { stageIndex: number; interval: number; dueDate: string }[] {
  if (!isValidISODate(baseDate)) throw new RangeError('Invalid base date')
  if (!intervals.length || intervals.some(value => !Number.isInteger(value) || value < 1 || value > 365)) throw new RangeError('Invalid review intervals')
  if (new Set(intervals).size !== intervals.length) throw new RangeError('Review intervals must be unique')
  return intervals.map((interval, stageIndex) => ({ stageIndex, interval, dueDate: addDaysISO(baseDate, interval) }))
}
