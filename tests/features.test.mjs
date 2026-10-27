import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const logic = readFileSync(new URL('../src/logic.ts', import.meta.url), 'utf8')
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')

test('review page wires a text search and three simultaneous filter controls', () => {
  assert.match(app, /value=\{reviewQuery\} onChange=/)
  assert.match(app, /subjectFilter/)
  assert.match(app, /dueFilter/)
  assert.match(app, /reviewStatusFilter/)
  assert.match(app, /matchesReviewFilters\(item/)
})

test('dashboard and performance page render data-backed SVG chart components', () => {
  assert.match(app, /<LineChart points=\{chartPoints\} metric=\{chartMetric\} \/>/)
  assert.match(app, /createLineChartGeometry\(values/)
  assert.match(app, /aria-label=\{metric === 'hours'/)
  assert.match(logic, /export function getPerformanceMetrics/)
})

test('range and metric switches are wired to chart state', () => {
  assert.match(app, /onRangeChange\(Number\(event\.target\.value\) as 7 \| 30\)/)
  assert.match(app, /setChartMetric\('hours'\)/)
  assert.match(app, /setChartMetric\('tests'\)/)
})

test('motion can be reduced by user setting and OS preference', () => {
  assert.match(css, /@keyframes page-in/)
  assert.match(css, /@keyframes grow-up/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /data-reduce-motion="true"/)
})


test('Command Palette includes keyboard shortcut, escape, arrows and enter handling', () => {
  assert.match(app, /event\.key\.toLowerCase\(\) === 'k'/)
  assert.match(app, /event\.key === 'Escape'/)
  assert.match(app, /event\.key === 'ArrowDown'/)
  assert.match(app, /event\.key === 'ArrowUp'/)
  assert.match(app, /event\.key === 'Enter'/)
  assert.match(app, /filterCommandItems\(commands, commandQuery\)/)
})

test('drag and drop supports a pointer handle plus keyboard/mobile move controls', () => {
  assert.match(app, /draggable onDragStart=/)
  assert.match(app, /onDrop=\{event =>/)
  assert.match(app, /onMoveUp/)
  assert.match(app, /onMoveDown/)
  assert.match(logic, /export function reorderPanels/)
})

test('theme, review state and card order use browser-local persistence', () => {
  assert.match(app, /localStorage\.setItem\(STORE\.theme/)
  assert.match(app, /localStorage\.setItem\(STORE\.reviews/)
  assert.match(app, /localStorage\.setItem\(STORE\.panelOrder/)
})

test('CSS avoids color-mix so legacy browser fallback colors remain available', () => {
  assert.doesNotMatch(css, /color-mix\s*\(/i)
  assert.match(css, /--accent-soft:/)
  assert.match(css, /--green-soft:/)
})

test('responsive breakpoints cover tablet and mobile navigation', () => {
  assert.match(css, /@media \(max-width: 900px\)/)
  assert.match(css, /@media \(max-width: 600px\)/)
  assert.match(css, /\.mobile-nav \{ position: fixed; display: flex;/)
})

test('GitHub Pages workflow installs, tests, builds and deploys the dist artifact', () => {
  assert.match(workflow, /npm install/)
  assert.match(workflow, /npm test/)
  assert.match(workflow, /npm run build/)
  assert.match(workflow, /path: dist/)
  assert.match(workflow, /actions\/deploy-pages@v4/)
  assert.match(viteConfig, /GITHUB_REPOSITORY/)
  assert.match(viteConfig, /repositoryName/)
})
