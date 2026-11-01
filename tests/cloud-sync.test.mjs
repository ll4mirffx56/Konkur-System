import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeEmptyCloudPayload,
  mergeCloudPayloads,
  normalizeCloudPayload,
  saveCloudStateSafely,
} from '../.test-tmp/cloudSync.js'

function review(id, title = id) {
  return {
    id,
    subject: 'شیمی',
    title,
    stage: 'مرور ۱ روزه',
    stageIndex: 0,
    interval: 1,
    baseDate: '2026-11-01',
    dueDate: '2026-11-02',
    done: false,
    doneAt: null,
    tone: 'violet',
  }
}

test('cloud normalization preserves legacy test records by classifying unassigned questions as blank', () => {
  const payload = makeEmptyCloudPayload()
  payload.performance = [{
    id: 'p-2026-11-01', date: '2026-11-01', hours: 5, planned: 6,
    tests: 10, correct: 6, wrong: 2, blank: 0, focus: 8,
  }]
  const normalized = normalizeCloudPayload(payload)
  assert.equal(normalized.performance[0].blank, 2)
})

test('cloud normalization rejects invalid dates, duplicate days, and impossible answer counts', () => {
  const payload = makeEmptyCloudPayload()
  payload.performance = [{
    id: 'p-2026-11-01', date: '2026-11-01', hours: 5, planned: 6,
    tests: 10, correct: 8, wrong: 3, blank: 0, focus: 8,
  }]
  assert.equal(normalizeCloudPayload(payload), null)
})

test('three-way merge preserves independent changes made on two devices', () => {
  const base = makeEmptyCloudPayload()
  const local = { ...base, reviews: [review('local')] }
  const remote = { ...base, reviews: [review('remote')] }
  const merged = mergeCloudPayloads(base, local, remote)
  assert.deepEqual(merged.reviews.map(item => item.id).sort(), ['local', 'remote'])
})

test('a local deletion is retained when the remote record was not changed', () => {
  const base = { ...makeEmptyCloudPayload(), reviews: [review('same')] }
  const local = { ...base, reviews: [] }
  const remote = structuredClone(base)
  const merged = mergeCloudPayloads(base, local, remote)
  assert.deepEqual(merged.reviews, [])
})

test('compare-and-swap retries after another device commits and keeps both devices changes', async () => {
  const base = makeEmptyCloudPayload()
  const local = { ...base, reviews: [review('local')] }
  let row = { payload: { ...base, reviews: [review('remote')] }, updated_at: '2026-11-01T10:00:00.000Z' }
  let attempts = 0
  const client = {
    from() {
      const query = {
        select() { return this },
        eq() { return this },
        async maybeSingle() { return { data: row, error: null } },
      }
      return query
    },
    async rpc(name, args) {
      assert.equal(name, 'save_user_app_state')
      attempts += 1
      if (attempts === 1) {
        row = {
          payload: { ...row.payload, reviews: [...row.payload.reviews, review('remote-second')] },
          updated_at: '2026-11-01T10:00:01.000Z',
        }
        return { data: [{ saved: false, current_payload: row.payload, current_updated_at: row.updated_at }], error: null }
      }
      if (args.p_expected_updated_at !== row.updated_at) {
        return { data: [{ saved: false, current_payload: row.payload, current_updated_at: row.updated_at }], error: null }
      }
      row = { payload: args.p_payload, updated_at: '2026-11-01T10:00:02.000Z' }
      return { data: [{ saved: true, current_payload: row.payload, current_updated_at: row.updated_at }], error: null }
    },
  }

  const saved = await saveCloudStateSafely(client, 'user-1', local, base)
  assert.equal(attempts, 2)
  assert.deepEqual(saved.payload.reviews.map(item => item.id).sort(), ['local', 'remote', 'remote-second'])
})
