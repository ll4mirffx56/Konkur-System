import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const cloud = readFileSync(new URL('../src/cloud.ts', import.meta.url), 'utf8')
const cloudSync = readFileSync(new URL('../src/cloudSync.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/202610270001_user_app_state.sql', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
const realtimeMigration = readFileSync(new URL('../supabase/migrations/202610270002_enable_user_app_state_realtime.sql', import.meta.url), 'utf8')
const safeSaveMigration = readFileSync(new URL('../supabase/migrations/202611010003_safe_user_state_compare_and_swap.sql', import.meta.url), 'utf8')

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
  assert.match(app, /saveCloudStateSafely/)
  assert.match(cloudSync, /save_user_app_state/)
  assert.match(app, /from\('user_app_state'\)\.select/)
})

test('cloud state is loaded before dashboard use and invalid data is rejected', () => {
  assert.match(app, /normalizeCloudPayload\(data\?\.payload\)/)
  assert.match(app, /validReviewArray\(payload\.reviews\)/)
  assert.match(app, /normalizePerformanceRecords\(/)
  assert.match(app, /normalizeCloudPayload\(row\.payload\)/)
  assert.match(app, /cloudUserDataReady/)
})

test('cloud data auto-saves with debounce and subscribes to Postgres changes', () => {
  assert.match(app, /supabase\.channel\(`moroor-state-\$\{userId\}`\)/)
  assert.match(app, /on\('postgres_changes'/)
  assert.match(app, /setTimeout\(\(\) =>/)
  assert.match(app, /همگام‌سازی خودکار فعال است/)
})

test('manual dispatch from development branch cannot deploy production', () => {
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/)
})

test('user-state table is added to realtime publication idempotently', () => {
  assert.match(realtimeMigration, /supabase_realtime/)
  assert.match(realtimeMigration, /pg_publication_tables/)
  assert.match(realtimeMigration, /user_app_state/)
})

test('automatic sync waits until data is hydrated for the current account', () => {
  assert.match(app, /cloudHydratedUserId !== userId/)
  assert.match(app, /lastSyncedPayloadRef\.current = null/)
  assert.match(app, /cloudHydratedUserId === cloudSession\.user\.id/)
})


test('cloud writes use an authenticated compare-and-swap function', () => {
  assert.match(safeSaveMigration, /auth\.uid\(\)/)
  assert.match(safeSaveMigration, /updated_at = p_expected_updated_at/)
  assert.match(safeSaveMigration, /greatest\(clock_timestamp\(\), state\.updated_at \+ interval '1 microsecond'\)/)
  assert.match(safeSaveMigration, /grant execute .* to authenticated/i)
  assert.match(cloudSync, /p_expected_updated_at/)
  assert.match(cloudSync, /maxAttempts = 6/)
})

test('Excel import validates interval arrays before rebuilding schedules', () => {
  assert.match(app, /function validIntervals\(value: unknown\): value is number\[\]/)
  assert.match(app, /if \(!validIntervals\(importedIntervals\)\) importedIntervals = DEFAULT_INTERVALS/)
})
