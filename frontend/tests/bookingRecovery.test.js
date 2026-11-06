import test from 'node:test'
import assert from 'node:assert/strict'
import { createSeatMapLoader } from '../src/components/seatMapData.js'
import { replaceSeatHold, reconcileSeatHolds } from '../src/components/seatHolds.js'
import { createSeatMapGestures } from '../src/components/useSeatMapViewport.js'
import { passengerValidationBody } from '../src/components/bookingData.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('passenger validation excludes later-step selections without changing the actual booking body', () => {
  const body = { flights: [{ flight_id: 1 }, { flight_id: 2 }], voucher_code: 'EXPIRED',
    passengers: [{ full_name: 'A', date_of_birth: '1990-01-01', passenger_type: 'ADULT',
      id_number: 'TEST', seat_ids: [7, 8], ancillaries: [{ code: 'REMOVED', segment: 1 }] }] }
  const validation = passengerValidationBody(body)
  assert.equal(validation.voucher_code, null)
  assert.deepEqual(validation.passengers[0].seat_ids, [null, null])
  assert.deepEqual(validation.passengers[0].ancillaries, [])
  assert.equal(validation.passengers[0].date_of_birth, body.passengers[0].date_of_birth)
  assert.equal(validation.passengers[0].id_number, 'TEST')
  assert.deepEqual(body.passengers[0].seat_ids, [7, 8])
  assert.equal(body.passengers[0].ancillaries[0].code, 'REMOVED')
  assert.equal(body.voucher_code, 'EXPIRED')
})

test('a failed initial load ends loading and a successful retry clears the error', async () => {
  const states = []
  let fail = true
  const loader = createSeatMapLoader(async () => {
    if (fail) throw new Error('503')
    return [{ flight_seat_id: 7 }]
  }, state => states.push(state))
  await loader.load()
  assert.equal(states.at(-1).loading, false)
  assert.equal(states.at(-1).loaded, false)
  assert.match(states.at(-1).error, /503/)
  fail = false
  await loader.load()
  assert.deepEqual(states.at(-1).seats, [{ flight_seat_id: 7 }])
  assert.equal(states.at(-1).error, '')
})

test('background errors keep old seats and the warning remains while retrying', async () => {
  const pending = deferred(), states = []
  const seats = [{ flight_seat_id: 7 }]
  const loader = createSeatMapLoader(() => pending.promise, s => states.push(s),
    { seats, loaded: true, error: 'Lỗi cũ' })
  const retry = loader.load()
  assert.equal(states.at(-1).seats, seats)
  assert.equal(states.at(-1).loading, false)
  assert.equal(states.at(-1).refreshing, true)
  assert.equal(states.at(-1).error, 'Lỗi cũ')
  pending.reject(new Error('Mất kết nối'))
  await retry
  assert.equal(states.at(-1).seats, seats)
  assert.match(states.at(-1).error, /Mất kết nối/)
})

test('late responses cannot overwrite newer seats', async () => {
  const first = deferred(), second = deferred(), states = []
  let calls = 0
  const loader = createSeatMapLoader(() => calls++ ? second.promise : first.promise, s => states.push(s))
  const a = loader.load(), b = loader.load()
  second.resolve([{ flight_seat_id: 2 }])
  await b
  first.resolve([{ flight_seat_id: 1 }])
  assert.equal(await a, undefined)
  assert.deepEqual(states.at(-1).seats, [{ flight_seat_id: 2 }])
})

test('unmounted map ignores both success and error from pending requests', async () => {
  for (const fail of [false, true]) {
    const pending = deferred(), states = []
    const loader = createSeatMapLoader(() => pending.promise, s => states.push(s))
    const loading = loader.load()
    loader.stop()
    if (fail) pending.reject(new Error('late error'))
    else pending.resolve([{ flight_seat_id: 1 }])
    await loading
    assert.equal(states.length, 1)
  }
})

test('an empty map is loaded, while malformed data is an error', async () => {
  for (const value of [[], null]) {
    let state
    const loader = createSeatMapLoader(async () => value, s => { state = s })
    await loader.load()
    assert.equal(state.loading, false)
    assert.equal(state.loaded, Array.isArray(value))
    assert.equal(!!state.error, value === null)
  }
})

test('a rejected new hold never releases the original seat', async () => {
  const calls = []
  await assert.rejects(replaceSeatHold(async (path, options) => {
    calls.push([path, options.method])
    throw new Error('409')
  }, 1, 2), /409/)
  assert.deepEqual(calls, [['/seats/2/hold', 'POST']])
})

test('replacement holds the new seat before releasing the old one', async () => {
  const calls = []
  const result = await replaceSeatHold(async (path, options) => {
    calls.push([path, options.method])
    return { ok: true }
  }, 1, 2)
  assert.equal(result.pendingRelease, null)
  assert.deepEqual(calls, [['/seats/2/hold', 'POST'], ['/seats/1/hold', 'DELETE']])
})

test('failed old-seat release is returned for recovery instead of swallowed', async () => {
  const result = await replaceSeatHold(async (_path, options) => {
    if (options.method === 'DELETE') throw new Error('503')
    return { ok: true }
  }, 1, 2)
  assert.deepEqual(result, { pendingRelease: 1, error: '503' })
})

test('already released old seats do not prevent selecting a new seat', async () => {
  const result = await replaceSeatHold(async () => ({ ok: false }), 1, 2)
  assert.equal(result.pendingRelease, null)
})

test('expired or stolen holds clear only the affected passenger and segment', () => {
  const passengers = [
    { seat_ids: [1, 11], ancillaries: [{ code: 'BAG20', segment: 0 }] },
    { seat_ids: [2, 12], ancillaries: [] },
    { seat_ids: [null, null], ancillaries: [] },
  ]
  const result = reconcileSeatHolds(passengers, 0, [
    { flight_seat_id: 1, status: 'AVAILABLE', mine: false },
    { flight_seat_id: 2, status: 'HELD', mine: true },
  ])
  assert.deepEqual(result.lost, [0])
  assert.deepEqual(result.passengers[0].seat_ids, [null, 11])
  assert.equal(result.passengers[0].ancillaries, passengers[0].ancillaries)
  assert.equal(result.passengers[1], passengers[1])
  assert.deepEqual(passengers[0].seat_ids, [1, 11])
})

test('still-owned holds keep the original state reference', () => {
  const passengers = [{ seat_ids: [1] }]
  assert.equal(reconcileSeatHolds(passengers, 0, [{ flight_seat_id: 1, mine: true }]).passengers, passengers)
})

test('a touch click with detail zero after a drag is suppressed, keyboard remains available', () => {
  const element = { scrollLeft: 0, scrollTop: 0, setPointerCapture() {} }
  const gestures = createSeatMapGestures(() => ({ element }), () => {})
  const pointer = (x, y) => ({ pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, preventDefault() {} })
  gestures.handlers.onPointerDown(pointer(100, 100))
  gestures.handlers.onPointerMove(pointer(100, 40))
  gestures.handlers.onPointerUp(pointer(100, 40))
  let prevented = false
  gestures.handlers.onClickCapture({ detail: 0, nativeEvent: { pointerType: 'touch' },
    preventDefault() { prevented = true }, stopPropagation() {} })
  assert.equal(prevented, true)
  gestures.handlers.onClickCapture({ detail: 0, preventDefault() { throw new Error('keyboard blocked') } })
})
