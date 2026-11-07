import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bookingProgress,
  groupLegs,
  checkInReason,
  changeReason,
  cancelReason,
} from '../src/components/bookingDetailState.js'
const now = Date.parse('2026-11-07T10:00:00Z')
const ticket = {
  id: 1,
  status: 'ISSUED',
  flight_id: 4,
  flight_status: 'SCHEDULED',
  departure_time: '2026-11-07T15:00:00Z',
  change_fee: 0,
}
const booking = {
  status: 'CONFIRMED',
  tickets: [ticket],
  payments: [{ status: 'SUCCESS', paid_at: '2026-11-06T10:00:00Z' }],
  created_at: '2026-11-06T09:00:00Z',
  refund: { amount: 0 },
}
test('pending is waiting for payment, without invented completion times', () => {
  const p = bookingProgress({
    ...booking,
    status: 'PENDING',
    payments: [],
    tickets: [{ ...ticket, status: 'PENDING' }],
  })
  assert.deepEqual(
    p.steps.map((s) => s.state),
    ['done', 'current', 'upcoming'],
  )
  assert.equal(p.steps[1].time, undefined)
  assert.equal(p.steps[2].time, null)
})
test('partial check-in remains current and counts individual active tickets', () => {
  const p = bookingProgress({
    ...booking,
    tickets: [
      {
        ...ticket,
        status: 'CHECKED_IN',
        checked_in_at: '2026-11-07T09:00:00Z',
      },
      { ...ticket, id: 2 },
      { ...ticket, id: 3, status: 'CANCELLED' },
    ],
  })
  assert.equal(p.completed, 1)
  assert.equal(p.total, 2)
  assert.equal(p.steps[2].state, 'current')
  assert.equal(p.steps[2].time, null)
})
test('all checked in uses actual final checked_in_at, not boarded_at', () => {
  const p = bookingProgress({
    ...booking,
    tickets: [
      { ...ticket, status: 'BOARDED', checked_in_at: '2026-11-07T09:00:00Z' },
      {
        ...ticket,
        id: 2,
        status: 'CHECKED_IN',
        checked_in_at: '2026-11-07T09:15:00Z',
      },
    ],
  })
  assert.equal(p.steps[2].state, 'done')
  assert.equal(p.steps[2].time, '2026-11-07T09:15:00Z')
})
test('completed tickets without recorded check-in time do not invent a timestamp', () =>
  assert.equal(
    bookingProgress({
      ...booking,
      tickets: [{ ...ticket, status: 'CHECKED_IN' }],
    }).steps[2].time,
    null,
  ))
for (const status of ['CANCELLED', 'EXPIRED'])
  test(`${status} stops progression and disallows actions`, () => {
    const b = { ...booking, status }
    const p = bookingProgress(b)
    assert.equal(p.stopped, true)
    assert.equal(p.steps[2].state, 'stopped')
    assert.ok(checkInReason(b, ticket, now))
    assert.ok(changeReason(b, { ...ticket, tickets: [ticket] }, now))
    assert.ok(cancelReason(b))
  })
test('check-in includes exact 24h and 1h boundaries and uses estimated time', () => {
  assert.equal(
    checkInReason(
      booking,
      ticket,
      Date.parse(ticket.departure_time) - 86400000,
    ),
    '',
  )
  assert.equal(
    checkInReason(booking, ticket, Date.parse(ticket.departure_time) - 3600000),
    '',
  )
  assert.ok(
    checkInReason(
      booking,
      ticket,
      Date.parse(ticket.departure_time) - 3600000 + 1,
    ),
  )
  assert.ok(
    checkInReason(
      booking,
      { ...ticket, estimated_departure: '2026-11-09T15:00:00Z' },
      now,
    ),
  )
})
test('cancelled/departed/arrived flights block check-in', () => {
  for (const flight_status of ['CANCELLED', 'DEPARTED', 'ARRIVED'])
    assert.ok(checkInReason(booking, { ...ticket, flight_status }, now))
})
test('change checks all tickets, fare and 3h; airline cancellation permits fee-free path', () => {
  const leg = { ...ticket, tickets: [ticket] }
  assert.equal(changeReason(booking, leg, now), '')
  assert.ok(changeReason(booking, { ...leg, change_fee: null }, now))
  assert.ok(changeReason(booking, leg, now + 2 * 3600000))
  assert.ok(
    changeReason(
      booking,
      { ...leg, tickets: [{ ...ticket, status: 'CHECKED_IN' }] },
      now,
    ),
  )
  assert.equal(
    changeReason(
      booking,
      { ...leg, flight_status: 'CANCELLED', change_fee: null },
      now + 10 * 3600000,
    ),
    '',
  )
})
test('zero refund allows cancellation; missing/refused quote blocks it', () => {
  assert.equal(cancelReason(booking), '')
  assert.ok(cancelReason({ ...booking, refund: undefined }))
  assert.equal(
    cancelReason({
      ...booking,
      refund: { amount: null, notes: ['Đã làm thủ tục'] },
    }),
    'Đã làm thủ tục',
  )
})
test('groups real tickets into separate legs and preserves order', () => {
  const legs = groupLegs([
    ticket,
    { ...ticket, id: 2, flight_id: 2 },
    { ...ticket, id: 3 },
  ])
  assert.equal(legs.length, 2)
  assert.deepEqual(
    legs.map((leg) => leg.flight_id),
    [4, 2],
  )
  assert.equal(legs[0].tickets.length, 2)
})
