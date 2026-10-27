import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const cloud = readFileSync(new URL('../src/cloud.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/202610270001_user_app_state.sql', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')

test('cloud integration uses publishable key and does not contain privileged keys', () => {
  assert.match(cloud, /VITE_SUPABASE_URL/)
  assert.match(cloud, /VITE_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(cloud, /service_role|sb_secret_/)
  assert.match(cloud, /persistSession: true/)
})

test('cloud state is scoped to authenticated user with RLS', () => {
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\)/)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /auth\.uid\(\) = user_id/)
  assert.match(app, /from\('user_app_state'\)\.upsert/)
  assert.match(app, /from\('user_app_state'\)\.select/)
})

test('cloud restore requires confirmation and validates payload before applying', () => {
  assert.match(app, /اطلاعات محلی این دستگاه با نسخهٔ ابری جایگزین می‌شود/)
  assert.match(app, /payload\.version !== 1/)
  assert.match(app, /validReviewArray\(payload\.reviews\)/)
  assert.match(app, /validPerformanceArray\(payload\.performance\)/)
})

test('manual dispatch from development branch cannot deploy production', () => {
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/)
})
