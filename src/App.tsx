import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import type { Session } from '@supabase/supabase-js'
import { cloudConfigured, supabase, type MoroorCloudPayload } from './cloud'
import { toGregorian, toJalaali } from 'jalaali-js'
import { addDaysISO, buildReviewSchedule, createLineChartGeometry, daysUntilISO, filterCommandItems, getPerformanceMetrics, isValidISODate, matchesReviewFilters, reorderPanels, type PanelKey } from './logic'
import {
  Activity, ArrowDownLeft, Bell, BookOpenCheck, CalendarDays, Check,
  CircleCheck, CircleHelp, Clock3, Command, Download, FileSpreadsheet, Flame, GripVertical,
  LayoutDashboard, ListChecks, Moon, MoreHorizontal, MoveDown, MoveUp, Plus, RotateCcw,
  Search, Settings2, SlidersHorizontal, Sun, Target, TrendingUp, Upload, X, Zap, Trash2,
} from 'lucide-react'
import { DEFAULT_STUDY_GOALS, validateStudyGoals, type StudyGoalSettings } from './goalExam'

type PageKey = 'dashboard' | 'reviews' | 'performance' | 'settings'
type ReviewItem = {
  id: string; subject: string; title: string; stage: string; stageIndex: number; interval: number;
  baseDate: string; dueDate: string; done: boolean; doneAt: string | null; tone: string
}
type PerformanceRecord = {
  id: string; date: string; hours: number; planned: number; tests: number; correct: number;
  wrong: number; blank: number; focus: number
}
type PerformancePoint = PerformanceRecord & { day: string }
type CommandItem = { id: string; label: string; description: string; keywords: string; run: () => void; icon: typeof LayoutDashboard }

const STORE = {
  theme: 'moroor-theme', reviews: 'moroor-reviews-v4', performance: 'moroor-performance-v1',
  panelOrder: 'moroor-panel-order-v3', reduceMotion: 'moroor-reduced-motion-v1', intervals: 'moroor-review-intervals-v1',
  studyGoals: 'moroor-study-goals-v1',
}
const DEFAULT_INTERVALS = [1, 3, 7, 30, 90]
const PANEL_ORDER: PanelKey[] = ['weekly', 'goal', 'reviews', 'quick']
const NAV: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
  { key: 'reviews', label: 'برنامهٔ مرور', icon: ListChecks },
  { key: 'performance', label: 'عملکرد مطالعه', icon: Activity },
  { key: 'settings', label: 'تنظیمات', icon: Settings2 },
]
const SUBJECT_TONES: Record<string, string> = { 'شیمی': 'violet', 'فیزیک': 'blue', 'حسابان': 'green', 'هندسه': 'amber', 'گسسته': 'blue' }
const PERSIAN_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

function readStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}
function formatFa(value: number): string { return Number.isFinite(value) ? value.toLocaleString('fa-IR', { maximumFractionDigits: 1 }) : '۰' }
function todayISO(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function serverDateInTehran(header: string): string | null {
  const date = new Date(header)
  if (Number.isNaN(date.getTime())) return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
    const part = (type: string) => parts.find(item => item.type === type)?.value
    const year = part('year'), month = part('month'), day = part('day')
    return year && month && day ? `${year}-${month}-${day}` : null
  } catch { return null }
}
function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/٫/g, '.').replace(/٬/g, ',')
}
function jalaliToISO(value: unknown): string | null {
  const text = toLatinDigits(String(value ?? '')).trim()
  const match = text.match(/(\d{4})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})/)
  if (!match) return null
  const jy = Number(match[1]), jm = Number(match[2]), jd = Number(match[3])
  if (jy < 1200 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null
  try { const g = toGregorian(jy, jm, jd); const check = toJalaali(g.gy, g.gm, g.gd); if (check.jy !== jy || check.jm !== jm || check.jd !== jd) return null; return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}` } catch { return null }
}
function isoToJalali(iso: string, short = false): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—'
  const [gy, gm, gd] = iso.split('-').map(Number)
  try { const j = toJalaali(gy, gm, gd); return short ? `${formatFa(j.jd)} ${PERSIAN_MONTHS[j.jm - 1]}` : `${formatFa(j.jy)}/${formatFa(j.jm).padStart(2, '۰')}/${formatFa(j.jd).padStart(2, '۰')}` } catch { return iso }
}
function getDueDays(item: ReviewItem, today: string): number { return daysUntilISO(item.dueDate, today) }
function getDueLabel(item: ReviewItem, today: string): string {
  if (item.done) return `انجام شد${item.doneAt ? ` · ${isoToJalali(item.doneAt)}` : ''}`
  const days = getDueDays(item, today)
  if (days < 0) return `${formatFa(Math.abs(days))} روز گذشته`
  if (days === 0) return 'امروز'
  return `${formatFa(days)} روز دیگر`
}
function makeReviewEntries(subject: string, title: string, baseDate: string, intervals: number[], idPrefix = `r${Date.now()}`): ReviewItem[] {
  return buildReviewSchedule(baseDate, intervals).map(({ interval, stageIndex, dueDate }) => ({
    id: `${idPrefix}-${stageIndex}`, subject, title, stage: `مرور ${formatFa(interval)} روزه`, stageIndex, interval,
    baseDate, dueDate, done: false, doneAt: null, tone: SUBJECT_TONES[subject] ?? 'violet',
  }))
}
function safeDownload(name: string, content: string, mime = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
function parseExcelDate(value: unknown): string | null {
  if (typeof value === 'number' && value > 20000 && value < 100000) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  const text = toLatinDigits(String(value ?? '')).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  return jalaliToISO(text)
}
function validReviewArray(value: unknown): value is ReviewItem[] {
  return Array.isArray(value) && value.every(item => item && typeof item.id === 'string' && typeof item.subject === 'string' && typeof item.title === 'string' && isValidISODate(item.dueDate) && isValidISODate(item.baseDate) && (item.doneAt == null || isValidISODate(item.doneAt)) && Number.isInteger(item.stageIndex) && Number.isInteger(item.interval))
}
function validPerformanceArray(value: unknown): value is PerformanceRecord[] {
  return Array.isArray(value) && value.every(item => item && typeof item.id === 'string' && isValidISODate(item.date) && [item.hours, item.planned, item.tests, item.correct, item.wrong, item.blank, item.focus].every(Number.isFinite))
}

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => readStored<'dark' | 'light'>(STORE.theme, 'dark'))
  const [today, setToday] = useState(todayISO)
  const [activePage, setActivePage] = useState<PageKey>('dashboard')
  const [notice, setNotice] = useState('')
  const [cloudSession, setCloudSession] = useState<Session | null>(null)
  const [cloudEmail, setCloudEmail] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudReady, setCloudReady] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [commandIndex, setCommandIndex] = useState(0)
  const [reviewRecords, setReviewRecords] = useState<ReviewItem[]>(() => readStored<ReviewItem[]>(STORE.reviews, []))
  const [performanceRecords, setPerformanceRecords] = useState<PerformanceRecord[]>(() => readStored<PerformanceRecord[]>(STORE.performance, []))
  const [intervals, setIntervals] = useState<number[]>(() => readStored<number[]>(STORE.intervals, DEFAULT_INTERVALS))
  const [studyGoals, setStudyGoals] = useState<StudyGoalSettings>(() => {
  const stored = readStored<unknown>(STORE.studyGoals, DEFAULT_STUDY_GOALS)
  return validateStudyGoals(stored) ? stored : DEFAULT_STUDY_GOALS
})
  const [panelOrder, setPanelOrder] = useState<PanelKey[]>(() => {
    const stored = readStored<PanelKey[]>(STORE.panelOrder, PANEL_ORDER)
    const valid = stored.filter(key => PANEL_ORDER.includes(key))
    return [...valid, ...PANEL_ORDER.filter(key => !valid.includes(key))]
  })
  const [draggingPanel, setDraggingPanel] = useState<PanelKey | null>(null)
  const [dropTarget, setDropTarget] = useState<PanelKey | null>(null)
  const [reviewQuery, setReviewQuery] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('همهٔ درس‌ها')
  const [dueFilter, setDueFilter] = useState('همهٔ موعدها')
  const [reviewStatusFilter, setReviewStatusFilter] = useState('همه')
  const [chartRange, setChartRange] = useState<7 | 30>(7)
  const [chartMetric, setChartMetric] = useState<'hours' | 'tests'>('hours')
  const [reduceMotion, setReduceMotion] = useState(() => readStored(STORE.reduceMotion, false))
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [showPerformanceForm, setShowPerformanceForm] = useState(false)
  const [reviewSubject, setReviewSubject] = useState('شیمی')
  const [reviewTitle, setReviewTitle] = useState('')
  const [reviewBaseDateText, setReviewBaseDateText] = useState(isoToJalali(todayISO()))
  const [performanceDateText, setPerformanceDateText] = useState(isoToJalali(todayISO()))
  const [performanceHours, setPerformanceHours] = useState('')
  const [plannedHours, setPlannedHours] = useState('')
  const [testCount, setTestCount] = useState('')
  const [correctCount, setCorrectCount] = useState('')
  const [wrongCount, setWrongCount] = useState('')
  const [blankCount, setBlankCount] = useState('')
  const [focusScore, setFocusScore] = useState('7')
  const commandInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const reviews = useMemo(() => reviewRecords.map(item => ({ ...item, dueDays: getDueDays(item, today) })), [reviewRecords, today])
  const filteredReviews = useMemo(() => reviews.filter(item => matchesReviewFilters(item, {
    query: reviewQuery, subject: subjectFilter, due: dueFilter, status: reviewStatusFilter,
  })), [reviews, reviewQuery, subjectFilter, dueFilter, reviewStatusFilter])
  const selectedPerformance = useMemo(() => {
    const start = addDaysISO(today, -(chartRange - 1))
    return performanceRecords.filter(item => item.date >= start && item.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  }, [performanceRecords, chartRange, today])
  const chartPoints: PerformancePoint[] = selectedPerformance.map(item => ({ ...item, day: isoToJalali(item.date, true) }))
  const currentMetrics = getPerformanceMetrics(chartPoints)
  const subjects = Array.from(new Set(reviews.map(item => item.subject)))

  useEffect(() => {
    let cancelled = false
    const syncServerDate = async () => {
      try {
        const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
        const header = response.headers.get('Date')
        const serverToday = header ? serverDateInTehran(header) : null
        if (!cancelled && serverToday) setToday(serverToday)
      } catch { /* Offline/local fallback: use the device clock. */ }
    }
    syncServerDate()
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (!supabase) { setCloudReady(true); return }
    let alive = true
    supabase.auth.getSession().then(({ data }) => { if (alive) { setCloudSession(data.session); setCloudReady(true) } })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setCloudSession(session); setCloudReady(true) })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem(STORE.theme, theme) } catch { /* storage unavailable */ } }, [theme])
  useEffect(() => { document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false'; try { localStorage.setItem(STORE.reduceMotion, String(reduceMotion)) } catch { /* storage unavailable */ } }, [reduceMotion])
  useEffect(() => { try { localStorage.setItem(STORE.reviews, JSON.stringify(reviewRecords)) } catch { setNotice('فضای ذخیره‌سازی مرورگر در دسترس نیست؛ از پشتیبان‌گیری استفاده کن.') } }, [reviewRecords])
  useEffect(() => { try { localStorage.setItem(STORE.performance, JSON.stringify(performanceRecords)) } catch { setNotice('فضای ذخیره‌سازی مرورگر در دسترس نیست؛ از پشتیبان‌گیری استفاده کن.') } }, [performanceRecords])
  useEffect(() => { try { localStorage.setItem(STORE.panelOrder, JSON.stringify(panelOrder)) } catch { /* layout still works in this session */ } }, [panelOrder])
  useEffect(() => { try { localStorage.setItem(STORE.intervals, JSON.stringify(intervals)) } catch { /* settings still work in this session */ } }, [intervals])
  useEffect(() => { try { localStorage.setItem(STORE.studyGoals, JSON.stringify(studyGoals)) } catch { setNotice('ذخیرهٔ هدف‌ها انجام نشد.') } }, [studyGoals])
  useEffect(() => {
    if (!searchOpen) return
    setCommandQuery(''); setCommandIndex(0); window.setTimeout(() => commandInputRef.current?.focus(), 0)
  }, [searchOpen])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(value => !value) }
      if (event.key === 'Escape') { setSearchOpen(false); setShowReviewForm(false); setShowPerformanceForm(false) }
    }
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const commands: CommandItem[] = useMemo(() => [
    ...NAV.map(item => ({ id: `page-${item.key}`, label: `رفتن به ${item.label}`, description: 'ناوبری', keywords: `${item.label} ${item.key}`, icon: item.icon, run: () => setActivePage(item.key) })),
    { id: 'add-review', label: 'افزودن موضوع برای مرور', description: 'ساخت پنج موعد مرور', keywords: 'افزودن موضوع مرور درس جلسه', icon: Plus, run: () => { setActivePage('reviews'); openNewReview() } },
    { id: 'add-performance', label: 'ثبت عملکرد امروز', description: 'ساعت مطالعه و تست‌ها', keywords: 'ثبت ساعت تست عملکرد', icon: Activity, run: () => { setActivePage('performance'); openNewPerformance() } },
    { id: 'theme', label: theme === 'dark' ? 'فعال‌کردن تم روشن' : 'فعال‌کردن تم تیره', description: 'ظاهر', keywords: 'تم روشن تاریک dark light theme', icon: theme === 'dark' ? Sun : Moon, run: () => setTheme(value => value === 'dark' ? 'light' : 'dark') },
    { id: 'backup', label: 'دانلود پشتیبان اطلاعات', description: 'فایل JSON', keywords: 'backup export پشتیبان خروجی', icon: Download, run: exportBackup },
  ], [theme, today, reviewRecords, performanceRecords, intervals, panelOrder, reduceMotion])
  const filteredCommands = useMemo(() => filterCommandItems(commands, commandQuery), [commands, commandQuery])
  useEffect(() => { setCommandIndex(0) }, [commandQuery])

  function toggleReview(id: string) {
    setReviewRecords(current => current.map(item => item.id === id ? { ...item, done: !item.done, doneAt: item.done ? null : today } : item))
  }
  function updateStudyGoal(key: keyof StudyGoalSettings, rawValue: string) {
  if (rawValue.trim() === '') return

  const value = Number(rawValue)
  const max = key === 'weeklyHours' ? 168 : 744

  if (!Number.isFinite(value) || value < 0 || value > max) {
    setNotice(`هدف ${key === 'weeklyHours' ? 'هفتگی' : 'ماهانه'} باید بین ۰ و ${max} ساعت باشد.`)
    return
  }

  setStudyGoals(current => ({ ...current, [key]: value }))
}
  function deleteReview(id: string) {
    const item = reviewRecords.find(review => review.id === id)
    if (!item || !window.confirm(`«${item.title} · ${item.stage}» حذف شود؟`)) return
    setReviewRecords(current => current.filter(review => review.id !== id)); setNotice('موعد مرور حذف شد.')
  }
  function addStudyItem(event: FormEvent) {
    event.preventDefault()
    const title = reviewTitle.trim()
    if (!title) { setNotice('عنوان جلسه یا موضوع را وارد کن.'); return }
    const baseDate = jalaliToISO(reviewBaseDateText)
    if (!baseDate) { setNotice('تاریخ جلالی معتبر وارد کن؛ قالب نمونه ۱۴۰۵/۰۸/۰۵ است.'); return }
    const newItems = makeReviewEntries(reviewSubject, title, baseDate, intervals)
    setReviewRecords(current => [...newItems, ...current]); setReviewTitle(''); setShowReviewForm(false); setNotice(`${formatFa(newItems.length)} موعد مرور ساخته شد.`)
  }
  function openNewReview() {
    setReviewTitle(''); setReviewBaseDateText(isoToJalali(today)); setShowReviewForm(true)
  }
  function openNewPerformance() {
    setPerformanceDateText(isoToJalali(today)); setPerformanceHours(''); setPlannedHours(''); setTestCount(''); setCorrectCount(''); setWrongCount(''); setBlankCount(''); setFocusScore('7'); setShowPerformanceForm(true)
  }
  function savePerformance(event: FormEvent) {
    event.preventDefault()
    const numeric = [performanceHours, plannedHours, testCount, correctCount, wrongCount, blankCount, focusScore].map(value => Number(value || 0))
    if (numeric.some(value => !Number.isFinite(value) || value < 0)) { setNotice('مقادیر باید عددی و نامنفی باشند.'); return }
    const [hours, planned, tests, correct, wrong, blank, focus] = numeric
    const parsedPerformanceDate = jalaliToISO(performanceDateText)
    if (!parsedPerformanceDate) { setNotice('تاریخ جلالی معتبر وارد کن؛ قالب نمونه ۱۴۰۵/۰۸/۰۵ است.'); return }
    if (focus > 10 || !Number.isInteger(focus) || hours > 24 || planned > 24 || !Number.isInteger(tests) || !Number.isInteger(correct) || !Number.isInteger(wrong) || !Number.isInteger(blank)) { setNotice('تمرکز باید بین ۰ تا ۱۰ و تعداد تست‌ها عدد صحیح باشد.'); return }
    if (correct + wrong + blank > tests) { setNotice('مجموع صحیح، غلط و نزده نباید از تعداد کل تست‌ها بیشتر شود.'); return }
    const entry: PerformanceRecord = { id: `p-${parsedPerformanceDate}`, date: parsedPerformanceDate, hours, planned, tests, correct, wrong, blank, focus }
    setPerformanceRecords(current => [...current.filter(item => item.date !== parsedPerformanceDate), entry].sort((a, b) => a.date.localeCompare(b.date)))
    setShowPerformanceForm(false); setNotice('عملکرد روز ذخیره شد.')
  }
  async function cloudSignIn(event: FormEvent) {
    event.preventDefault()
    if (!supabase) { setNotice('اتصال ابری هنوز تنظیم نشده است. ابتدا متغیرهای محیطی Supabase را تنظیم کن.'); return }
    if (!cloudEmail.trim() || cloudPassword.length < 6) { setNotice('ایمیل معتبر و رمز عبور حداقل ۶ حرفی وارد کن.'); return }
    setCloudBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: cloudEmail.trim(), password: cloudPassword })
      if (error) throw error
      setCloudPassword('')
      setNotice('ورود موفق بود. برای انتقال اطلاعات، «ارسال اطلاعات به ابر» را جداگانه اجرا کن.')
    } catch (error) { setNotice(error instanceof Error ? `ورود ناموفق بود: ${error.message}` : 'ورود ناموفق بود.') }
    finally { setCloudBusy(false) }
  }
  async function cloudSignUp() {
    if (!supabase) { setNotice('اتصال ابری هنوز تنظیم نشده است.'); return }
    if (!cloudEmail.trim() || cloudPassword.length < 6) { setNotice('ایمیل معتبر و رمز عبور حداقل ۶ حرفی وارد کن.'); return }
    setCloudBusy(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email: cloudEmail.trim(), password: cloudPassword })
      if (error) throw error
      if (!data.session) setNotice('حساب ساخته شد. ایمیلت را برای تأیید بررسی کن؛ سپس وارد شو.')
      else setNotice('حساب ساخته شد و وارد شدی. حالا می‌توانی اطلاعات را به ابر بفرستی.')
      setCloudPassword('')
    } catch (error) { setNotice(error instanceof Error ? `ساخت حساب ناموفق بود: ${error.message}` : 'ساخت حساب ناموفق بود.') }
    finally { setCloudBusy(false) }
  }
  async function cloudSignOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    setNotice(error ? `خروج ناموفق بود: ${error.message}` : 'از حساب ابری خارج شدی. اطلاعات محلی این دستگاه دست‌نخورده ماند.')
  }
  function currentCloudPayload(): MoroorCloudPayload {
    return { version: 1, reviews: reviewRecords, performance: performanceRecords, intervals, theme, panelOrder, reduceMotion, studyGoals }
  }
  async function uploadCloudState() {
    if (!supabase || !cloudSession?.user) { setNotice('برای همگام‌سازی ابتدا وارد حساب ابری شو.'); return }
    if (!window.confirm('اطلاعات فعلی همین دستگاه در فضای ابری ذخیره و جایگزین نسخهٔ ابری قبلی می‌شود. ادامه می‌دهی؟')) return
    setCloudBusy(true)
    try {
      const { error } = await supabase.from('user_app_state').upsert({ user_id: cloudSession.user.id, payload: currentCloudPayload(), updated_at: new Date().toISOString() })
      if (error) throw error
      setNotice('اطلاعات فعلی این دستگاه در فضای ابری ذخیره شد.')
    } catch (error) { setNotice(error instanceof Error ? `ذخیرهٔ ابری ناموفق بود: ${error.message}` : 'ذخیرهٔ ابری ناموفق بود.') }
    finally { setCloudBusy(false) }
  }
  async function downloadCloudState() {
    if (!supabase || !cloudSession?.user) { setNotice('برای دریافت اطلاعات ابتدا وارد حساب ابری شو.'); return }
    if (!window.confirm('اطلاعات محلی این دستگاه با نسخهٔ ابری جایگزین می‌شود. قبل از ادامه از اطلاعات فعلی پشتیبان بگیر. ادامه می‌دهی؟')) return
    setCloudBusy(true)
    try {
      const { data, error } = await supabase.from('user_app_state').select('payload').eq('user_id', cloudSession.user.id).maybeSingle()
      if (error) throw error
      const payload = data?.payload as Partial<MoroorCloudPayload> | undefined
      if (!payload || payload.version !== 1 || !validReviewArray(payload.reviews) || !validPerformanceArray(payload.performance)) throw new Error('نسخهٔ ابری وجود ندارد یا ساختار آن معتبر نیست؛ ابتدا از دستگاهی که اطلاعات دارد، ارسال اطلاعات به ابر را اجرا کن.')
      setReviewRecords(payload.reviews); setPerformanceRecords(payload.performance)
      if (Array.isArray(payload.intervals) && payload.intervals.length === 5 && payload.intervals.every(v => Number.isInteger(v) && v > 0 && v <= 365) && new Set(payload.intervals).size === 5) setIntervals(payload.intervals)
      if (payload.theme === 'dark' || payload.theme === 'light') setTheme(payload.theme)
      if (Array.isArray(payload.panelOrder) && payload.panelOrder.length === PANEL_ORDER.length && payload.panelOrder.every(v => PANEL_ORDER.includes(v as PanelKey)) && new Set(payload.panelOrder).size === PANEL_ORDER.length) setPanelOrder(payload.panelOrder as PanelKey[])
      if (typeof payload.reduceMotion === 'boolean') setReduceMotion(payload.reduceMotion)
      if (validateStudyGoals(payload.studyGoals)) setStudyGoals(payload.studyGoals)
      setNotice('اطلاعات ابری روی این دستگاه بازیابی شد.')
    } catch (error) { setNotice(error instanceof Error ? `بازیابی ابری ناموفق بود: ${error.message}` : 'بازیابی ابری ناموفق بود.') }
    finally { setCloudBusy(false) }
  }

  function exportBackup() {
    const payload = { app: 'moroor', version: 1, exportedAt: new Date().toISOString(), intervals, reviews: reviewRecords, performance: performanceRecords, theme, panelOrder, reduceMotion, studyGoals }
    safeDownload(`moroor-backup-${today}.json`, JSON.stringify(payload, null, 2))
    setNotice('پشتیبان JSON آماده شد.')
  }
  function exportExcel() {
    const reviewRows: (string | number)[][] = [['گزارش برنامه مرور'], [], ['درس', 'جلسه / موضوع', 'تاریخ اتمام', ...intervals.map(value => `مرور ${formatFa(value)} روزه`), 'وضعیت کلی', ...intervals.map(value => `وضعیت مرور ${formatFa(value)} روزه`)]]
    const grouped = new Map<string, ReviewItem[]>()
    reviewRecords.forEach(item => { const key = `${item.subject}\u0000${item.title}\u0000${item.baseDate}`; grouped.set(key, [...(grouped.get(key) ?? []), item]) })
    grouped.forEach(items => {
      const first = items[0]
      const stages = intervals.map((_, index) => items.find(item => item.stageIndex === index))
      const dates = stages.map(item => item ? isoToJalali(item.dueDate) : '')
      const statuses = stages.map(item => item?.done ? 'انجام شد' : 'انجام نشده')
      reviewRows.push([first.subject, first.title, isoToJalali(first.baseDate), ...dates, stages.every(item => item?.done) ? 'تکمیل‌شده' : 'در جریان', ...statuses])
    })
    const perfRows: (string | number)[][] = [['گزارش عملکرد مطالعه'], [], ['تاریخ', 'ساعت مطالعه', 'ساعت برنامه', 'تعداد تست', 'صحیح', 'غلط', 'نزده', 'تمرکز (۰ تا ۱۰)']]
    performanceRecords.forEach(item => perfRows.push([isoToJalali(item.date), item.hours, item.planned, item.tests, item.correct, item.wrong, item.blank, item.focus]))
    const settingsRows: (string | number)[][] = [['تنظیمات'], [], ['سال', 1406], ...intervals.map((value, index) => [`فاصله مرور ${index + 1}`, value])]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reviewRows), 'مرور'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(perfRows), 'عملکرد'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(settingsRows), 'تنظیمات')
    XLSX.writeFile(wb, `moroor-export-${today}.xlsx`); setNotice('فایل اکسل خروجی ساخته شد.')
  }
  function importBackupFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as { reviews?: unknown; performance?: unknown; intervals?: unknown; theme?: unknown; panelOrder?: unknown; reduceMotion?: unknown }
        if (!validReviewArray(payload.reviews) || !validPerformanceArray(payload.performance)) throw new Error('invalid backup')
        if (!window.confirm(`پشتیبان شامل ${formatFa(payload.reviews.length)} موعد مرور و ${formatFa(payload.performance.length)} رکورد عملکرد است. اطلاعات فعلی با آن جایگزین شود؟`)) return
        setReviewRecords(payload.reviews); setPerformanceRecords(payload.performance)
        if (Array.isArray(payload.intervals) && payload.intervals.length === 5 && payload.intervals.every(value => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 365) && new Set(payload.intervals).size === 5) setIntervals(payload.intervals as number[])
        if (payload.theme === 'dark' || payload.theme === 'light') setTheme(payload.theme)
        if (Array.isArray(payload.panelOrder) && payload.panelOrder.every(value => typeof value === 'string' && PANEL_ORDER.includes(value as PanelKey)) && payload.panelOrder.length === PANEL_ORDER.length && new Set(payload.panelOrder).size === PANEL_ORDER.length) setPanelOrder(payload.panelOrder as PanelKey[])
        if (typeof payload.reduceMotion === 'boolean') setReduceMotion(payload.reduceMotion)
        setNotice('پشتیبان با موفقیت بازیابی شد.')
      } catch { setNotice('فایل پشتیبان معتبر نیست یا ساختار آن شناخته نشد.') }
    }
    reader.onerror = () => setNotice('خواندن فایل ناموفق بود.')
    reader.readAsText(file, 'utf-8')
  }
  function importExcelFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: 'array' })
        const importedReviews: ReviewItem[] = []; const importedPerformance: PerformanceRecord[] = []
        const settingsSheet = wb.Sheets['تنظیمات']
        const settingsRows = settingsSheet ? XLSX.utils.sheet_to_json<unknown[]>(settingsSheet, { header: 1, raw: true, defval: '' }) : []
        let importedIntervals = DEFAULT_INTERVALS.map((fallback, index) => Number(settingsRows[index + 3]?.[1]) || fallback)
        if (importedIntervals.some(value => !Number.isInteger(value) || value < 1 || value > 365) || new Set(importedIntervals).size !== importedIntervals.length) importedIntervals = DEFAULT_INTERVALS
        const reviewSheet = wb.Sheets['مرور']
        if (reviewSheet) {
          const rows = XLSX.utils.sheet_to_json<unknown[]>(reviewSheet, { header: 1, raw: true, defval: '' })
          const note = String(rows[1]?.[0] ?? '')
          rows.slice(3).forEach((row, rowIndex) => {
            const subject = String(row[0] ?? '').trim(); const title = String(row[1] ?? '').trim(); const baseDate = parseExcelDate(row[2])
            if (!subject || !title || !baseDate) return
            if (rowIndex === 0 && /نمونه|مثال/.test(note)) return
            const entries = makeReviewEntries(subject, title, baseDate, importedIntervals, `import-r-${Date.now()}-${rowIndex}`)
            entries.forEach((entry, stageIndex) => {
              const status = toLatinDigits(String(row[9 + stageIndex] ?? '')).trim()
              entry.done = status === 'انجام شد' || status === 'انجام‌شده' || status.toLowerCase() === 'done'
              entry.doneAt = null
              importedReviews.push(entry)
            })
          })
        }
        const performanceSheet = wb.Sheets['عملکرد']
        if (performanceSheet) {
          const rows = XLSX.utils.sheet_to_json<unknown[]>(performanceSheet, { header: 1, raw: true, defval: '' })
          const note = String(rows[1]?.[0] ?? '')
          rows.slice(3).forEach((row, rowIndex) => {
            const date = parseExcelDate(row[0]); if (!date) return
            if (rowIndex === 0 && /نمونه|مثال/.test(note)) return
            const n = (index: number) => Math.max(0, Number(toLatinDigits(String(row[index] ?? 0)).replace(/,/g, '')) || 0)
            importedPerformance.push({ id: `import-p-${date}`, date, hours: n(1), planned: n(2), tests: n(3), correct: n(4), wrong: n(5), blank: n(6), focus: Math.min(10, n(7)) })
          })
        }
        if (!reviewSheet && !performanceSheet) throw new Error('missing sheets')
        if (!window.confirm(`از اکسل ${formatFa(importedReviews.length / Math.max(1, importedIntervals.length))} موضوع مرور و ${formatFa(importedPerformance.length)} روز عملکرد استخراج شد. داده‌های فعلی جایگزین شوند؟ ردیف نمونهٔ مشخص‌شده در اکسل نادیده گرفته می‌شود.`)) return
        setReviewRecords(importedReviews); setPerformanceRecords(importedPerformance); setIntervals(importedIntervals)
        setNotice('داده‌های اکسل وارد شدند؛ لطفاً چند ردیف را با فایل اصلی تطبیق بده.')
      } catch (error) { setNotice(`خواندن اکسل ناموفق بود: ${error instanceof Error ? error.message : 'ساختار فایل شناخته نشد'}`) }
    }
    reader.onerror = () => setNotice('خواندن فایل اکسل ناموفق بود.')
    reader.readAsArrayBuffer(file)
  }
  function handleImport(file?: File) {
    if (!file) return
    if (file.name.toLowerCase().endsWith('.json')) importBackupFile(file)
    else if (/\.xlsx?$|\.xlsm$/i.test(file.name)) importExcelFile(file)
    else setNotice('فرمت پشتیبانی‌شده: فایل اکسل یا پشتیبان JSON.')
  }
  function updateIntervals(index: number, value: string) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) return
    const next = intervals.map((interval, i) => i === index ? parsed : interval)
    if (new Set(next).size !== next.length) { setNotice('فاصله‌های مرور باید با هم متفاوت باشند.'); return }
    setIntervals(next)
    setReviewRecords(current => current.map(item => {
      const interval = next[item.stageIndex] ?? item.interval
      return { ...item, interval, stage: `مرور ${formatFa(interval)} روزه`, dueDate: addDaysISO(item.baseDate, interval) }
    }))
  }
  function movePanel(source: PanelKey, target: PanelKey) { if (source !== target) setPanelOrder(current => reorderPanels(current, source, target)) }
  function shiftPanel(key: PanelKey, step: -1 | 1) {
    setPanelOrder(current => { const index = current.indexOf(key); const target = index + step; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next })
  }
  function runCommand(item?: CommandItem) { if (!item) return; item.run(); setSearchOpen(false) }

  const pageTitle = NAV.find(item => item.key === activePage)?.label ?? 'داشبورد'
  const todayReviews = reviews.filter(item => !item.done && item.dueDays === 0).length
  const overdueReviews = reviews.filter(item => !item.done && item.dueDays < 0).length
  const recentHours = chartPoints.reduce((sum, item) => sum + item.hours, 0)
  const subjectsForForm = ['شیمی', 'فیزیک', 'حسابان', 'هندسه', 'گسسته', ...subjects.filter(subject => !['شیمی', 'فیزیک', 'حسابان', 'هندسه', 'گسسته'].includes(subject))]

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BookOpenCheck size={21} strokeWidth={2.3} /></div><div className="brand-copy"><strong>مــرور</strong><span>STUDY OS</span></div></div>
      <div className="workspace-label">فضای کاری</div>
      <nav className="main-nav" aria-label="ناوبری اصلی">{NAV.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-item ${activePage === key ? 'active' : ''}`} onClick={() => setActivePage(key)}><Icon size={18} /><span>{label}</span>{key === 'reviews' && <span className="nav-count">{formatFa(todayReviews + overdueReviews)}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="focus-card"><div className="focus-card-top"><span className="focus-icon"><Flame size={16} /></span><span>موعدهای باز</span></div><div className="focus-number">{formatFa(todayReviews + overdueReviews)} <small>مرور امروز و عقب‌افتاده</small></div><div className="streak-track"><span style={{ width: `${reviews.length ? Math.min(100, reviews.filter(item => item.done).length / reviews.length * 100) : 0}%` }} /></div><p>ثبت و پیگیری را از همین‌جا ادامه بده.</p></div><button className="help-link" onClick={() => setNotice('تاریخ‌ها با ساعت محلی دستگاه محاسبه و به تقویم جلالی نمایش داده می‌شوند.')}><CircleHelp size={17} /> راهنمای تاریخ‌ها</button><div className="profile"><div className="avatar">م</div><div className="profile-info"><strong>فضای شخصی</strong><span>{cloudSession ? 'حساب ابری متصل' : 'ذخیرهٔ محلی در مرورگر'}</span></div><MoreHorizontal size={19} className="muted-icon" /></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>فضای کاری</span><span className="crumb-slash">/</span><strong>{pageTitle}</strong></div><div className="topbar-actions"><button className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="جست‌وجو و فرمان"><Search size={17} /><span>جست‌وجو یا اجرای فرمان...</span><kbd><Command size={11} /> K</kbd></button><button className="icon-button" aria-label="اعلان‌ها" onClick={() => setNotice(`${formatFa(todayReviews)} مرور امروز و ${formatFa(overdueReviews)} مرور عقب‌افتاده داری.`)}><Bell size={18} /><i /></button><span className="topbar-divider" /><button className="theme-toggle" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')} aria-label="تغییر تم">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}<span>{theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}</span></button></div></header>

      {activePage === 'dashboard' && <div className="page-wrap page-enter">
        <section className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> امروز، {isoToJalali(today)} <span className="live-pill">تاریخ دستگاه</span></div><h1>نمای کلی <span>مطالعه‌ات</span></h1><p className="page-subtitle">خلاصهٔ واقعی داده‌هایی که ثبت کرده‌ای؛ هر تغییری خودکار ذخیره می‌شود.</p></div><button className="primary-button" onClick={openNewPerformance}><Plus size={17} /> ثبت عملکرد</button></section>
        <section className="stats-grid" aria-label="شاخص‌های کلیدی"><StatCard title="مرورهای امروز" value={formatFa(todayReviews)} suffix="مورد" delta="موعد مرور امروز" icon={CalendarDays} color="violet" progress={reviews.length ? todayReviews / reviews.length * 100 : 0} /><StatCard title="مرورهای عقب‌افتاده" value={formatFa(overdueReviews)} suffix="مورد" delta="نیازمند رسیدگی" icon={Clock3} color="amber" progress={reviews.length ? overdueReviews / reviews.length * 100 : 0} /><StatCard title={`ساعت مطالعهٔ ${chartRange === 7 ? 'هفته' : 'ماه'}`} value={formatFa(recentHours)} suffix="ساعت" delta={`${formatFa(chartPoints.length)} روز ثبت‌شده`} icon={Activity} color="blue" progress={Math.min(100, recentHours / (chartRange === 7 ? 35 : 150) * 100)} /><StatCard title="اجرای برنامه" value={formatFa(Math.round(currentMetrics.planExecution))} suffix="٪" delta="ساعت واقعی ÷ ساعت برنامه" icon={Target} color="green" progress={currentMetrics.planExecution} /></section>
        <section className="dashboard-grid" aria-label="کارت‌های داشبورد" onDragEnd={() => { setDraggingPanel(null); setDropTarget(null) }}>{panelOrder.map(key => <div key={key} className={`dashboard-card-wrap ${dropTarget === key ? 'drop-target' : ''} ${draggingPanel === key ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (draggingPanel && draggingPanel !== key) setDropTarget(key) }} onDrop={event => { event.preventDefault(); const source = event.dataTransfer?.getData('text/plain') as PanelKey | undefined; if (source && PANEL_ORDER.includes(source)) movePanel(source, key); setDraggingPanel(null); setDropTarget(null) }}>
          {key === 'weekly' && <WeeklyPanel points={chartPoints} range={chartRange} onRangeChange={setChartRange} onMoveUp={() => shiftPanel(key, -1)} onMoveDown={() => shiftPanel(key, 1)} onDragStart={() => setDraggingPanel(key)} onDragEnd={() => setDraggingPanel(null)} />}
          {key === 'goal' && <GoalPanel points={chartPoints} range={chartRange} onMoveUp={() => shiftPanel(key, -1)} onMoveDown={() => shiftPanel(key, 1)} onDragStart={() => setDraggingPanel(key)} onDragEnd={() => setDraggingPanel(null)} />}
          {key === 'reviews' && <ReviewsPanel reviews={reviews} today={today} onToggle={toggleReview} onViewAll={() => setActivePage('reviews')} onAdd={openNewReview} onMoveUp={() => shiftPanel(key, -1)} onMoveDown={() => shiftPanel(key, 1)} onDragStart={() => setDraggingPanel(key)} onDragEnd={() => setDraggingPanel(null)} />}
          {key === 'quick' && <QuickPanel onNavigate={setActivePage} onAddReview={() => { setActivePage('reviews'); openNewReview() }} onAddPerformance={() => { setActivePage('performance'); openNewPerformance() }} onMoveUp={() => shiftPanel(key, -1)} onMoveDown={() => shiftPanel(key, 1)} onDragStart={() => setDraggingPanel(key)} onDragEnd={() => setDraggingPanel(null)} />}
        </div>)}</section>
        <footer className="page-footer"><span>مرور · موتور محاسبات فعال</span><span><i className="footer-status" /> ذخیرهٔ محلی فعال است</span></footer>
      </div>}

      {activePage === 'reviews' && <div className="page-wrap page-enter">
        <section className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> مدیریت مرورها <span className="live-pill">محاسبهٔ خودکار موعد</span></div><h1>برنامهٔ <span>مرور</span></h1><p className="page-subtitle">با ثبت یک جلسه، موعدهای مرور مطابق فاصله‌های تنظیم‌شده ساخته می‌شوند.</p></div><button className="primary-button" onClick={openNewReview}><Plus size={17} /> افزودن موضوع</button></section>
        <section className="panel filter-panel"><div className="filter-heading"><div><SlidersHorizontal size={17} /><strong>جست‌وجو و فیلتر</strong></div><button className="text-button" onClick={() => { setReviewQuery(''); setSubjectFilter('همهٔ درس‌ها'); setDueFilter('همهٔ موعدها'); setReviewStatusFilter('همه') }}><RotateCcw size={14} /> پاک‌کردن فیلترها</button></div>
          <div className="filters-row"><label className="review-search"><Search size={17} /><input aria-label="جست‌وجو در مرورها" value={reviewQuery} onChange={event => setReviewQuery(event.target.value)} placeholder="نام درس، جلسه یا موضوع را بنویس..." />{reviewQuery && <button onClick={() => setReviewQuery('')} aria-label="پاک‌کردن جست‌وجو"><X size={14} /></button>}</label><label className="select-field"><span>درس</span><select value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)}><option>همهٔ درس‌ها</option>{subjects.map(subject => <option key={subject}>{subject}</option>)}</select></label><label className="select-field"><span>موعد</span><select value={dueFilter} onChange={event => setDueFilter(event.target.value)}><option>همهٔ موعدها</option><option>امروز</option><option>عقب‌افتاده</option><option>آینده</option></select></label><label className="select-field"><span>وضعیت</span><select value={reviewStatusFilter} onChange={event => setReviewStatusFilter(event.target.value)}><option>همه</option><option>انجام‌نشده</option><option>انجام‌شده</option></select></label></div>
        </section>
        <section className="panel review-table-panel"><div className="table-panel-heading"><div><h2>فهرست موعدهای مرور</h2><p>موعد هر مرحله از تاریخ شروع + فاصلهٔ همان مرحله محاسبه می‌شود.</p></div><span className="table-count">{formatFa(filteredReviews.length)} نتیجه</span></div>
          {filteredReviews.length ? <div className="review-table">{[...filteredReviews].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(item => <div className={`review-table-row ${item.done ? 'is-complete' : ''}`} key={item.id}><button className={`toggle-done ${item.done ? 'checked' : ''}`} onClick={() => toggleReview(item.id)} aria-label={item.done ? 'علامت‌زدن به‌عنوان انجام‌نشده' : 'علامت‌زدن به‌عنوان انجام‌شده'}>{item.done && <Check size={14} />}</button><span className={`subject-avatar ${item.tone}`}>{item.subject.slice(0, 1)}</span><div className="review-table-main"><strong>{item.title}</strong><span>{item.subject} <i /> {item.stage} <i /> شروع: {isoToJalali(item.baseDate)}</span></div><span className={`status-badge ${item.done ? 'done' : item.dueDays < 0 ? 'late' : item.dueDays === 0 ? 'today' : 'future'}`}><i />{getDueLabel(item, today)}</span><button className="row-more" onClick={() => deleteReview(item.id)} aria-label="حذف موعد مرور"><Trash2 size={16} /></button></div>)}</div> : <div className="empty-state"><span><ListChecks size={23} /></span><strong>{reviews.length ? 'موردی پیدا نشد' : 'هنوز موضوعی برای مرور ثبت نشده'}</strong><p>{reviews.length ? 'عبارت جست‌وجو یا فیلترها را تغییر بده.' : 'با ثبت درس و تاریخ شروع، پنج موعد مرور به‌صورت خودکار ساخته می‌شود.'}</p><button className="secondary-button" onClick={() => reviews.length ? (setReviewQuery(''), setSubjectFilter('همهٔ درس‌ها'), setDueFilter('همهٔ موعدها'), setReviewStatusFilter('همه')) : openNewReview()}>{reviews.length ? 'نمایش همهٔ مرورها' : 'ثبت اولین موضوع'}</button></div>}
        </section>
      </div>}

      {activePage === 'performance' && <div className="page-wrap page-enter">
        <section className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> گزارش و تحلیل <span className="live-pill">داده‌های ثبت‌شده</span></div><h1>عملکرد <span>مطالعه</span></h1><p className="page-subtitle">ساعت مطالعه، تست‌ها، دقت پاسخ‌گویی و اجرای برنامه از رکوردهای خودت.</p></div><div className="welcome-actions"><div className="range-switch" role="group" aria-label="بازهٔ نمودار"><button className={chartRange === 7 ? 'selected' : ''} onClick={() => setChartRange(7)}>۷ روز</button><button className={chartRange === 30 ? 'selected' : ''} onClick={() => setChartRange(30)}>۳۰ روز</button></div><button className="primary-button" onClick={openNewPerformance}><Plus size={16} /> ثبت روز</button></div></section>
        <section className="stats-grid performance-stats"><StatCard title="مجموع ساعت مطالعه" value={formatFa(currentMetrics.hours)} suffix="ساعت" delta={`${formatFa(selectedPerformance.length)} روز ثبت‌شده`} icon={Clock3} color="blue" progress={Math.min(100, currentMetrics.hours / (chartRange === 7 ? 35 : 150) * 100)} /><StatCard title="مجموع تست‌ها" value={formatFa(currentMetrics.tests)} suffix="تست" delta="تعداد کل ثبت‌شده" icon={Target} color="violet" progress={Math.min(100, currentMetrics.tests / (chartRange === 7 ? 250 : 1500) * 100)} /><StatCard title="میانگین روز ثبت‌شده" value={formatFa(currentMetrics.averageHours)} suffix="ساعت" delta="فقط روزهای دارای رکورد" icon={TrendingUp} color="green" progress={Math.min(100, currentMetrics.averageHours / 8 * 100)} /><StatCard title="درصد پاسخ صحیح" value={formatFa(Math.round(currentMetrics.accuracy))} suffix="٪" delta="صحیح ÷ کل تست‌ها" icon={CircleCheck} color="amber" progress={currentMetrics.accuracy} /><StatCard title="اجرای برنامه" value={`${formatFa(Math.round(currentMetrics.planExecution))}`} suffix="٪" delta="میانگین ساعت واقعی ÷ برنامه" icon={Target} color="violet" progress={currentMetrics.planExecution} /><StatCard title="میانگین تمرکز" value={formatFa(currentMetrics.averageFocus)} suffix="/۱۰" delta="میانگین روزهای ثبت‌شده" icon={Zap} color="blue" progress={currentMetrics.averageFocus * 10} /></section>
        <section className="panel performance-chart-panel"><div className="panel-heading"><div><div className="section-kicker">TREND ANALYSIS</div><h2>{chartMetric === 'hours' ? 'روند ساعت مطالعه' : 'روند تعداد تست'}</h2><p>فقط رکوردهای واقعی ثبت‌شده در این مرورگر نمایش داده می‌شوند.</p></div><div className="metric-switch"><button className={chartMetric === 'hours' ? 'selected' : ''} onClick={() => setChartMetric('hours')}><Clock3 size={14} /> ساعت</button><button className={chartMetric === 'tests' ? 'selected' : ''} onClick={() => setChartMetric('tests')}><Target size={14} /> تست</button></div></div>{chartPoints.length ? <LineChart points={chartPoints} metric={chartMetric} /> : <div className="empty-state chart-empty"><span><Activity size={22} /></span><strong>هنوز داده‌ای برای نمودار وجود ندارد</strong><p>اولین رکورد روزانه‌ات را ثبت کن تا روند عملکرد نمایش داده شود.</p><button className="secondary-button" onClick={() => setShowPerformanceForm(true)}>ثبت عملکرد</button></div>}</section>
        <section className="panel performance-table-panel"><div className="table-panel-heading"><div><h2>ثبت‌های روزانه</h2><p>برای هر تاریخ یک رکورد نگه داشته می‌شود؛ ثبت دوباره همان روز آن را به‌روزرسانی می‌کند.</p></div><span className="table-count">{formatFa(selectedPerformance.length)} روز</span></div>{selectedPerformance.length ? <div className="performance-table">{[...selectedPerformance].reverse().map(item => <div className="performance-row" key={item.id}><strong>{isoToJalali(item.date)}</strong><span>{formatFa(item.hours)} ساعت</span><span>{formatFa(item.tests)} تست</span><span>صحیح {formatFa(item.correct)} · غلط {formatFa(item.wrong)} · نزده {formatFa(item.blank)}</span><span>تمرکز {formatFa(item.focus)}/۱۰</span><span>تست/ساعت {formatFa(item.hours > 0 ? item.tests / item.hours : 0)}</span><button className="row-more" onClick={() => { setPerformanceDateText(isoToJalali(item.date)); setPerformanceHours(String(item.hours)); setPlannedHours(String(item.planned)); setTestCount(String(item.tests)); setCorrectCount(String(item.correct)); setWrongCount(String(item.wrong)); setBlankCount(String(item.blank)); setFocusScore(String(item.focus)); setShowPerformanceForm(true) }} aria-label="ویرایش عملکرد"><MoreHorizontal size={18} /></button><button className="row-more" onClick={() => { if (window.confirm(`رکورد ${isoToJalali(item.date)} حذف شود؟`)) setPerformanceRecords(current => current.filter(row => row.id !== item.id)) }} aria-label="حذف عملکرد"><Trash2 size={15} /></button></div>)}</div> : <div className="empty-state"><span><CalendarDays size={22} /></span><strong>هنوز رکوردی در این بازه ثبت نشده</strong><p>برای هر روز، ساعت برنامه و واقعی و آمار تست‌ها را وارد کن.</p></div>}</section>
        <section className="panel note-panel"><span className="note-icon"><CircleHelp size={17} /></span><div><strong>نحوهٔ محاسبه</strong><p>درصد پاسخ صحیح = صحیح ÷ تعداد کل تست‌ها. اجرای برنامه = میانگین ساعت مطالعهٔ واقعی ÷ ساعت برنامه در روزهایی که ساعت برنامه بزرگ‌تر از صفر است؛ همانند اکسل، مقدار از ۱۰۰٪ بیشتر هم می‌تواند باشد. این درصد، نمرهٔ کنکور با نمرهٔ منفی نیست.</p></div></section>
      </div>}

      {activePage === 'settings' && <div className="page-wrap page-enter settings-page"><section className="welcome-row"><div><div className="eyebrow"><span className="status-dot" /> تنظیمات برنامه</div><h1>تنظیمات <span>و داده‌ها</span></h1><p className="page-subtitle">فاصله‌های مرور، ظاهر و مدیریت پشتیبان اطلاعات.</p></div></section>
        <section className="panel interval-settings"><div className="table-panel-heading"><div><h2>فاصله‌های مرور</h2><p>با تغییر فاصله، موعدهای موجود نیز از تاریخ شروع دوباره محاسبه می‌شوند.</p></div></div><div className="interval-fields">{intervals.map((value, index) => <label className="select-field" key={index}><span>مرور شمارهٔ {formatFa(index + 1)} (روز)</span><input type="number" min="1" max="365" value={value} onChange={event => updateIntervals(index, event.target.value)} /></label>)}</div></section>
        <section className="panel interval-settings cloud-panel"><div className="table-panel-heading"><div><h2>حساب و همگام‌سازی ابری</h2><p>اطلاعات فقط با اقدام خودت ارسال یا دریافت می‌شود؛ همگام‌سازی خودکار در این نسخه فعال نیست.</p></div><span className={`status-dot ${cloudSession ? '' : 'muted'}`} /></div>
          {!cloudConfigured() ? <div className="form-info"><CircleHelp size={16} /><span>اتصال Supabase تنظیم نشده است. فایل راهنمای CLOUD-SETUP.md را دنبال کن و متغیرهای محیطی را در تنظیمات GitHub وارد کن.</span></div> : !cloudSession ? <form className="cloud-auth-form" onSubmit={cloudSignIn}><label className="form-field"><span>ایمیل</span><input type="email" autoComplete="email" value={cloudEmail} onChange={event => setCloudEmail(event.target.value)} required placeholder="you@example.com" /></label><label className="form-field"><span>رمز عبور</span><input type="password" autoComplete="current-password" minLength={6} value={cloudPassword} onChange={event => setCloudPassword(event.target.value)} required /></label><div className="form-actions"><button className="secondary-button" type="button" disabled={cloudBusy || !cloudReady} onClick={cloudSignUp}>ساخت حساب</button><button className="primary-button" type="submit" disabled={cloudBusy || !cloudReady}>{cloudBusy ? 'در حال انجام…' : 'ورود'}</button></div></form> : <><div className="form-info"><CircleCheck size={16} /><span>وارد شده‌ای: {cloudSession.user.email ?? 'حساب کاربری'}</span></div><div className="form-actions cloud-actions"><button className="secondary-button" disabled={cloudBusy} onClick={uploadCloudState}>ارسال اطلاعات به ابر</button><button className="secondary-button" disabled={cloudBusy} onClick={downloadCloudState}>دریافت از ابر</button><button className="secondary-button" disabled={cloudBusy} onClick={cloudSignOut}>خروج</button></div></>}
        </section>
        <section className="settings-grid"><div className="panel settings-card"><div className="setting-symbol"><Sun size={19} /></div><div className="setting-copy"><strong>تم رنگی</strong><p>میان حالت تیره و روشن جابه‌جا شو.</p></div><button className="theme-setting-button" onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <><Sun size={16} /> حالت روشن</> : <><Moon size={16} /> حالت تیره</>}</button></div>
          <div className="panel settings-card"><div className="setting-symbol"><Zap size={19} /></div><div className="setting-copy"><strong>کاهش حرکت</strong><p>حرکت‌ها و انتقال‌های تزئینی را محدود کن.</p></div><button className={`switch ${reduceMotion ? 'on' : ''}`} role="switch" aria-checked={reduceMotion} onClick={() => setReduceMotion(value => !value)}><span /></button></div>
          <div className="panel settings-card"><div className="setting-symbol"><Download size={19} /></div><div className="setting-copy"><strong>پشتیبان JSON</strong><p>نسخه‌ای از همهٔ مرورها، عملکرد و تنظیمات ذخیره کن.</p></div><button className="secondary-button" onClick={exportBackup}><Download size={15} /> دریافت</button></div>
          <div className="panel settings-card"><div className="setting-symbol"><Upload size={19} /></div><div className="setting-copy"><strong>بازیابی یا ورود اکسل</strong><p>پشتیبان JSON یا فایل سیستم‌مرور.xlsx را وارد کن.</p></div><button className="secondary-button" onClick={() => importInputRef.current?.click()}><Upload size={15} /> انتخاب فایل</button></div>
          <div className="panel settings-card"><div className="setting-symbol"><FileSpreadsheet size={19} /></div><div className="setting-copy"><strong>خروجی اکسل</strong><p>فهرست مرور و عملکرد را در دو برگه ذخیره کن.</p></div><button className="secondary-button" onClick={exportExcel}><Download size={15} /> خروجی</button></div>
          <div className="panel settings-card"><div className="setting-symbol"><GripVertical size={19} /></div><div className="setting-copy"><strong>چیدمان داشبورد</strong><p>ترتیب کارت‌ها را به حالت اولیه برگردان.</p></div><button className="secondary-button" onClick={() => { setPanelOrder(PANEL_ORDER); setNotice('چیدمان داشبورد بازنشانی شد.') }}><RotateCcw size={15} /> بازنشانی</button></div>
        </section>
        <div className="settings-disclaimer"><CircleHelp size={16} /><span>تاریخ امروز از ساعت محلی دستگاه گرفته و با الگوریتم تقویم جلالی تبدیل می‌شود؛ برای این کار اتصال به Google یا اینترنت لازم نیست. اطلاعات محلی در همین مرورگر ذخیره می‌شود. برای همگام‌سازی، از بخش حساب و همگام‌سازی ابری به‌صورت دستی ارسال یا دریافت کن؛ پیش از جایگزینی داده‌ها پشتیبان بگیر.</span></div>
        <input ref={importInputRef} type="file" accept=".json,.xlsx,.xls,.xlsm" hidden onChange={event => { handleImport(event.target.files?.[0]); event.currentTarget.value = '' }} />
      </div>}
    </main>

    <nav className="mobile-nav" aria-label="ناوبری موبایل">{NAV.map(({ key, label, icon: Icon }) => <button key={key} className={activePage === key ? 'active' : ''} onClick={() => setActivePage(key)}><Icon size={19} /><span>{label}</span></button>)}</nav>

    {showReviewForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowReviewForm(false) }}><form className="data-modal" onSubmit={addStudyItem} role="dialog" aria-modal="true" aria-label="افزودن موضوع مرور"><div className="data-modal-heading"><div><h2>افزودن موضوع برای مرور</h2><p>پنج موعد بر اساس فاصله‌های تنظیم‌شده ساخته می‌شود.</p></div><button type="button" className="icon-button" onClick={() => setShowReviewForm(false)} aria-label="بستن"><X size={17} /></button></div><label className="form-field"><span>درس</span><select value={reviewSubject} onChange={event => setReviewSubject(event.target.value)}>{subjectsForForm.map(subject => <option key={subject}>{subject}</option>)}</select></label><label className="form-field"><span>جلسه یا موضوع</span><input value={reviewTitle} onChange={event => setReviewTitle(event.target.value)} placeholder="مثلاً استوکیومتری — جلسه ۸" required autoFocus /></label><label className="form-field"><span>تاریخ اتمام جلسه (شمسی)</span><input type="text" inputMode="numeric" value={reviewBaseDateText} onChange={event => setReviewBaseDateText(event.target.value)} placeholder="۱۴۰۵/۰۸/۰۵" required /></label><div className="form-info"><CalendarDays size={15} /><span>موعدها: {intervals.map(value => `${formatFa(value)} روز`).join('، ')} پس از تاریخ شروع.</span></div><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setShowReviewForm(false)}>انصراف</button><button type="submit" className="primary-button"><Plus size={15} /> ساخت موعدها</button></div></form></div>}

    {showPerformanceForm && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowPerformanceForm(false) }}><form className="data-modal wide-modal" onSubmit={savePerformance} role="dialog" aria-modal="true" aria-label="ثبت عملکرد مطالعه"><div className="data-modal-heading"><div><h2>ثبت عملکرد روزانه</h2><p>برای هر تاریخ یک رکورد نگه داشته می‌شود.</p></div><button type="button" className="icon-button" onClick={() => setShowPerformanceForm(false)} aria-label="بستن"><X size={17} /></button></div><div className="form-grid"><label className="form-field"><span>تاریخ (شمسی)</span><input type="text" inputMode="numeric" value={performanceDateText} onChange={event => setPerformanceDateText(event.target.value)} placeholder="۱۴۰۵/۰۸/۰۵" required /></label><label className="form-field"><span>ساعت مطالعه</span><input type="number" min="0" max="24" step="0.25" value={performanceHours} onChange={event => setPerformanceHours(event.target.value)} placeholder="مثلاً ۵٫۵" required /></label><label className="form-field"><span>ساعت برنامه</span><input type="number" min="0" max="24" step="0.25" value={plannedHours} onChange={event => setPlannedHours(event.target.value)} placeholder="مثلاً ۶" required /></label><label className="form-field"><span>کل تست‌ها</span><input type="number" min="0" step="1" value={testCount} onChange={event => setTestCount(event.target.value)} placeholder="مثلاً ۴۰" required /></label><label className="form-field"><span>صحیح</span><input type="number" min="0" step="1" value={correctCount} onChange={event => setCorrectCount(event.target.value)} placeholder="مثلاً ۳۰" required /></label><label className="form-field"><span>غلط</span><input type="number" min="0" step="1" value={wrongCount} onChange={event => setWrongCount(event.target.value)} placeholder="مثلاً ۷" required /></label><label className="form-field"><span>نزده</span><input type="number" min="0" step="1" value={blankCount} onChange={event => setBlankCount(event.target.value)} placeholder="مثلاً ۳" required /></label><label className="form-field"><span>تمرکز (۰ تا ۱۰)</span><input type="number" min="0" max="10" step="1" value={focusScore} onChange={event => setFocusScore(event.target.value)} required /></label></div><div className="form-info"><CircleHelp size={15} /><span>صحیح + غلط + نزده باید از کل تست‌ها بیشتر نباشد. درصد صحیح با تقسیم صحیح بر کل تست‌ها محاسبه می‌شود.</span></div><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setShowPerformanceForm(false)}>انصراف</button><button type="submit" className="primary-button"><Check size={15} /> ذخیرهٔ عملکرد</button></div></form></div>}

    {searchOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSearchOpen(false) }}><div className="command-modal" role="dialog" aria-modal="true" aria-label="جست‌وجو و فرمان"><div className="command-input"><Search size={19} /><input ref={commandInputRef} value={commandQuery} onChange={event => setCommandQuery(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setCommandIndex(index => Math.min(filteredCommands.length - 1, index + 1)) } else if (event.key === 'ArrowUp') { event.preventDefault(); setCommandIndex(index => Math.max(0, index - 1)) } else if (event.key === 'Enter') { event.preventDefault(); runCommand(filteredCommands[commandIndex]) } }} placeholder="جست‌وجو یا اجرای فرمان..." /><kbd>ESC</kbd><button onClick={() => setSearchOpen(false)} aria-label="بستن"><X size={17} /></button></div><div className="command-label">{commandQuery ? 'نتایج جست‌وجو' : 'فرمان‌های پیشنهادی'}</div><div className="command-results">{filteredCommands.length ? filteredCommands.map((item, index) => { const Icon = item.icon; return <button className={`command-result ${commandIndex === index ? 'selected' : ''}`} key={item.id} onMouseEnter={() => setCommandIndex(index)} onClick={() => runCommand(item)}><Icon size={17} /><span className="command-result-copy"><strong>{item.label}</strong><small>{item.description}</small></span><ArrowDownLeft size={14} /></button> }) : <div className="command-empty">فرمانی با این عبارت پیدا نشد.</div>}</div><div className="command-hint"><span><kbd>↑</kbd><kbd>↓</kbd> حرکت</span><span><kbd>↵</kbd> اجرا</span><span><kbd>ESC</kbd> بستن</span></div></div></div>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="بستن پیام"><X size={16} /></button></div>}
  </div>
}

function PanelTools({ id, onDragStart, onDragEnd, onMoveUp, onMoveDown }: { id: PanelKey; onDragStart: () => void; onDragEnd: () => void; onMoveUp: () => void; onMoveDown: () => void }) {
  return <div className="drag-tools" title="برای تغییر ترتیب کارت بکش یا از فلش‌ها استفاده کن"><button className="move-button" aria-label="انتقال کارت به بالا" onClick={onMoveUp}><MoveUp size={13} /></button><button className="drag-handle" draggable onDragStart={event => { event.dataTransfer?.setData('text/plain', id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; onDragStart() }} onDragEnd={onDragEnd} aria-label="گرفتن و جابه‌جایی کارت"><GripVertical size={17} /></button><button className="move-button" aria-label="انتقال کارت به پایین" onClick={onMoveDown}><MoveDown size={13} /></button></div>
}
function PanelHeading({ eyebrow, title, subtitle, tools, children }: { eyebrow: string; title: string; subtitle: string; tools: ReactNode; children?: ReactNode }) {
  return <div className="panel-heading"><div><div className="section-kicker">{eyebrow}</div><h2>{title}</h2><p>{subtitle}</p></div><div className="panel-heading-actions">{children}{tools}</div></div>
}
function StatCard({ title, value, suffix, delta, icon: Icon, color, progress }: { title: string; value: string; suffix: string; delta: string; icon: typeof Activity; color: string; progress: number }) {
  return <article className="panel stat-card"><div className="stat-top"><span>{title}</span><span className={`stat-icon ${color}`}><Icon size={18} /></span></div><div className="stat-value">{value}<small>{suffix}</small></div><div className="stat-bottom"><span className="delta neutral">{delta}</span></div><div className="stat-progress"><span className={color} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div></article>
}
function WeeklyPanel({ points, range, onRangeChange, onMoveUp, onMoveDown, onDragStart, onDragEnd }: { points: PerformancePoint[]; range: 7 | 30; onRangeChange: (value: 7 | 30) => void; onMoveUp: () => void; onMoveDown: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const data = points.slice(-range); const max = Math.max(1, ...data.map(point => point.hours)); const hours = data.reduce((sum, point) => sum + point.hours, 0)
  return <article className="panel weekly-panel"><PanelHeading eyebrow="CONSISTENCY" title="ریتم مطالعه" subtitle="ساعت‌های ثبت‌شده در بازهٔ انتخاب‌شده" tools={<PanelTools id="weekly" onDragStart={onDragStart} onDragEnd={onDragEnd} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />}><select className="period-select" value={range} onChange={event => onRangeChange(Number(event.target.value) as 7 | 30)} aria-label="بازهٔ زمانی"><option value={7}>۷ روز اخیر</option><option value={30}>۳۰ روز اخیر</option></select></PanelHeading><div className="chart-summary"><strong>{formatFa(hours)} <small>ساعت</small></strong><span className="sample-note">{formatFa(data.length)} روز ثبت‌شده</span></div>{data.length ? <div className={`bar-chart ${range === 30 ? 'long-range' : ''}`} role="img" aria-label={`نمودار ساعت مطالعه در ${range} روز اخیر`}>{data.map((point, index) => <div className="bar-column" key={point.id} title={`${isoToJalali(point.date)}: ${formatFa(point.hours)} ساعت`}><span className="bar-value">{range === 7 || index % 4 === 0 ? formatFa(point.hours) : ''}</span><div className="bar-rail"><span className={`bar-fill ${index === data.length - 1 ? 'highlight' : ''}`} style={{ height: `${point.hours / max * 100}%` }} /></div><span className="bar-day">{range === 7 || index % 4 === 0 ? point.day.split(' ')[0] : ''}</span></div>)}</div> : <div className="mini-empty">با ثبت عملکرد روزانه، نمودار اینجا نمایش داده می‌شود.</div>}<div className="chart-footer"><span><i className="legend-dot" /> ساعت مطالعه</span><span>دادهٔ ساختگی نمایش داده نمی‌شود.</span></div></article>
}
function GoalPanel({ points, range, onMoveUp, onMoveDown, onDragStart, onDragEnd }: { points: PerformancePoint[]; range: 7 | 30; onMoveUp: () => void; onMoveDown: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const actual = points.reduce((sum, point) => sum + point.hours, 0); const target = range === 7 ? 35 : 150; const percent = Math.min(100, Math.round(actual / target * 100))
  return <article className="panel goal-panel"><PanelHeading eyebrow="PERIOD TARGET" title="هدف بازه" subtitle="پیشرفت نسبت به هدف مرجع" tools={<PanelTools id="goal" onDragStart={onDragStart} onDragEnd={onDragEnd} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />} /><div className="ring-wrap"><svg viewBox="0 0 180 180" className="progress-ring" aria-label={`${formatFa(percent)} درصد از هدف`}><circle cx="90" cy="90" r="72" className="ring-track" /><circle cx="90" cy="90" r="72" className="ring-value" style={{ strokeDashoffset: `${452.4 * (1 - percent / 100)}` }} /></svg><div className="ring-center"><strong>{formatFa(percent)}٪</strong><span>از هدف مرجع</span></div></div><div className="goal-meta"><span>{formatFa(actual)} از {formatFa(target)} ساعت</span><strong>{formatFa(Math.max(0, target - actual))} ساعت باقی‌مانده</strong></div><div className="goal-progress"><span style={{ width: `${percent}%` }} /></div><div className="goal-note"><Zap size={15} /><span>هدف ۳۵ ساعت هفتگی یا ۱۵۰ ساعت ماهانه، مقدار مرجع اولیه است.</span></div></article>
}
function ReviewsPanel({ reviews, today, onToggle, onViewAll, onAdd, onMoveUp, onMoveDown, onDragStart, onDragEnd }: { reviews: ReviewItem[]; today: string; onToggle: (id: string) => void; onViewAll: () => void; onAdd: () => void; onMoveUp: () => void; onMoveDown: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const nextReviews = [...reviews].filter(item => !item.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3)
  return <article className="panel reviews-panel"><PanelHeading eyebrow="UP NEXT" title="مرورهای پیشِ رو" subtitle="نزدیک‌ترین موعدها" tools={<PanelTools id="reviews" onDragStart={onDragStart} onDragEnd={onDragEnd} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />}><button className="text-button" onClick={onViewAll}>مشاهدهٔ همه <ArrowDownLeft size={15} /></button></PanelHeading>{nextReviews.length ? <div className="review-list">{nextReviews.map(item => { const days = getDueDays(item, today); return <div className="review-row" key={item.id}><div className={`subject-avatar ${item.tone}`}>{item.subject.slice(0, 1)}</div><div className="review-main"><strong>{item.title}</strong><span>{item.subject} <i /> {item.stage}</span></div><div className={`due-label ${days < 0 ? 'overdue' : ''}`}><span />{getDueLabel(item, today)}</div><button className="complete-button" aria-label={`تکمیل ${item.title}`} onClick={() => onToggle(item.id)}><Check size={16} /></button></div> })}</div> : <div className="mini-empty">مروری برای نمایش وجود ندارد.</div>}<button className="add-review-button" onClick={onAdd}><Plus size={16} /> افزودن موضوع به برنامهٔ مرور</button></article>
}
function QuickPanel({ onNavigate, onAddReview, onAddPerformance, onMoveUp, onMoveDown, onDragStart, onDragEnd }: { onNavigate: (page: PageKey) => void; onAddReview: () => void; onAddPerformance: () => void; onMoveUp: () => void; onMoveDown: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  return <article className="panel quick-panel"><PanelHeading eyebrow="QUICK ACCESS" title="دسترسی سریع" subtitle="کارهای روزمره" tools={<PanelTools id="quick" onDragStart={onDragStart} onDragEnd={onDragEnd} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />} /><div className="quick-actions"><QuickAction icon={ListChecks} title="افزودن موضوع مرور" desc="ساخت پنج موعد از تاریخ شروع" tone="violet" onClick={onAddReview} /><QuickAction icon={TrendingUp} title="ثبت عملکرد مطالعه" desc="ساعت، تست و تمرکز" tone="blue" onClick={onAddPerformance} /><QuickAction icon={Settings2} title="تنظیمات و پشتیبان" desc="فاصله‌های مرور و فایل‌ها" tone="green" onClick={() => onNavigate('settings')} /></div></article>
}
function QuickAction({ icon: Icon, title, desc, tone, onClick }: { icon: typeof Activity; title: string; desc: string; tone: string; onClick: () => void }) { return <button className="quick-action" onClick={onClick}><span className={`quick-icon ${tone}`}><Icon size={18} /></span><span className="quick-copy"><strong>{title}</strong><small>{desc}</small></span><ArrowDownLeft size={16} className="quick-arrow" /></button> }
function LineChart({ points, metric }: { points: PerformancePoint[]; metric: 'hours' | 'tests' }) {
  const values = points.map(point => metric === 'hours' ? point.hours : point.tests); const width = 800; const height = 240; const padX = 26; const padY = 20; const plotH = height - 2 * padY
  const geometry = createLineChartGeometry(values, width, height, padX, padY); const { max, coords, line, area } = geometry
  const tickIndexes = points.length > 14 ? [0, Math.floor((points.length - 1) / 3), Math.floor((points.length - 1) * 2 / 3), points.length - 1] : [0, Math.floor((points.length - 1) / 2), points.length - 1]
  return <div className="line-chart-wrap"><div className="line-chart-y-labels"><span>{formatFa(Math.round(max))}</span><span>{formatFa(Math.round(max * .66))}</span><span>{formatFa(Math.round(max * .33))}</span><span>۰</span></div><svg className="line-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={metric === 'hours' ? 'نمودار خطی ساعت مطالعه' : 'نمودار خطی تعداد تست'}><defs><linearGradient id="chart-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" className="chart-gradient-start" /><stop offset="100%" className="chart-gradient-end" /></linearGradient></defs>{[0, 1, 2, 3].map(index => <line key={index} x1={padX} x2={width - padX} y1={padY + plotH * index / 3} y2={padY + plotH * index / 3} className="chart-gridline" />)}<path d={area} fill="url(#chart-area-fill)" className="chart-area" /><path d={line} className="chart-line" />{coords.map((point, index) => (points.length <= 14 || index === points.length - 1 || index === 0) ? <circle key={index} cx={point.x} cy={point.y} r={points.length <= 14 ? 3.5 : 2.5} className="chart-point"><title>{`${points[index].day}: ${formatFa(point.value)}`}</title></circle> : null)}{tickIndexes.map(index => <text key={index} x={coords[index]?.x ?? padX} y={height - 2} textAnchor="middle" className="chart-axis-label">{points[index]?.day}</text>)}</svg><div className="chart-legend"><span><i className="legend-dot" />{metric === 'hours' ? 'ساعت مطالعه' : 'تعداد تست'}</span><span>{formatFa(points.length)} رکورد روزانه</span></div></div>
}

export default App
