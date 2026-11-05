import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getSeedExitRows } from '../src/components/seatMapLayout.js'
import { createSeatMapGestures, clampZoom, MIN_ZOOM, MAX_ZOOM } from '../src/components/useSeatMapViewport.js'

const sql = readFileSync(new URL('../../database/03_seed.sql', import.meta.url), 'utf8')
function seededSeats(model) {
  const seats = []
  const pattern = /\('(A320|A321|B789)',\s*'(BUSINESS|ECONOMY)',\s*(\d+),\s*(\d+),\s*'([A-Z-]+)',\s*(\d+)\)/g
  for (const [, code, cabin, first, last, columns, fee] of sql.matchAll(pattern)) {
    if (code !== model) continue
    for (let row = Number(first); row <= Number(last); row += 1) {
      Array.from(columns).forEach((letter, index) => {
        if (letter !== '-') seats.push({ cabin_class: cabin, seat_row: row, seat_letter: letter, grid_col: index + 1, seat_fee: fee })
      })
    }
  }
  return seats
}

for (const [model, exits] of [['A320', [12, 13]], ['A321', [16, 17]], ['B789', [26]]]) {
  test(`exit rows match the actual ${model} seed layout`, () => {
    assert.deepEqual([...getSeedExitRows(seededSeats(model))], exits)
  })
}

test('unknown, incomplete or repriced layouts do not acquire guessed exits', () => {
  assert.equal(getSeedExitRows([]), null)
  assert.equal(getSeedExitRows(seededSeats('A320').slice(1)), null)
  const custom = seededSeats('A321')
  custom[0] = { ...custom[0], seat_fee: 200000 }
  assert.equal(getSeedExitRows(custom), null)
})

function setup() {
  const element = { clientWidth: 400, scrollLeft: 50, scrollTop: 100,
    getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture: () => {} }
  const view = { element, zoom: 1, fit: 1, planeWidth: 500 }
  const changes = []
  const gestures = createSeatMapGestures(() => view, (zoom, scroll) => {
    changes.push({ zoom, scroll })
    view.zoom = zoom
    element.scrollLeft = scroll.left
    element.scrollTop = scroll.top
  })
  const event = (id, x, y) => ({ pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, preventDefault: () => {} })
  function click(detail = 1) {
    let prevented = false
    let stopped = false
    gestures.handlers.onClickCapture({ detail, preventDefault: () => { prevented = true }, stopPropagation: () => { stopped = true } })
    return { prevented, stopped }
  }
  return { ...gestures.handlers, reset: gestures.reset, view, changes, event, click }
}

test('a tap or tiny finger movement leaves the seat click intact', () => {
  const s = setup()
  s.onPointerDown(s.event(1, 100, 100))
  s.onPointerMove(s.event(1, 102, 101))
  s.onPointerUp(s.event(1, 102, 101))
  assert.deepEqual(s.click(), { prevented: false, stopped: false })
  assert.equal(s.changes.length, 0)
})

test('dragging pans and prevents the subsequent seat click', () => {
  const s = setup()
  s.onPointerDown(s.event(1, 100, 100))
  s.onPointerMove(s.event(1, 80, 60))
  s.onPointerUp(s.event(1, 80, 60))
  assert.equal(s.view.element.scrollLeft, 70)
  assert.equal(s.view.element.scrollTop, 140)
  assert.deepEqual(s.click(), { prevented: true, stopped: true })
})

test('two-finger pinch changes zoom and never selects a seat', () => {
  const s = setup()
  s.onPointerDown(s.event(1, 100, 100))
  s.onPointerDown(s.event(2, 200, 100))
  s.onPointerMove(s.event(2, 300, 100))
  assert.equal(s.changes.at(-1).zoom, 2)
  s.onPointerUp(s.event(2, 300, 100))
  s.onPointerMove(s.event(1, 90, 90))
  s.onPointerUp(s.event(1, 90, 90))
  assert.equal(s.click().prevented, true)
})

test('pinch and zoom controls share the lower and upper limits', () => {
  const s = setup()
  s.onPointerDown(s.event(1, 100, 100))
  s.onPointerDown(s.event(2, 200, 100))
  s.onPointerMove(s.event(2, 900, 100))
  assert.equal(s.view.zoom, MAX_ZOOM)
  s.onPointerMove(s.event(2, 101, 100))
  assert.equal(s.view.zoom, MIN_ZOOM)
  assert.equal(clampZoom(-100), MIN_ZOOM)
  assert.equal(clampZoom(100), MAX_ZOOM)
})

test('cancel suppresses clicks, a new tap works, and keyboard clicks stay usable', () => {
  const s = setup()
  s.onPointerDown(s.event(1, 100, 100))
  s.onPointerCancel(s.event(1, 100, 100))
  assert.equal(s.click().prevented, true)
  assert.equal(s.click(0).prevented, false)
  s.onPointerDown(s.event(2, 100, 100))
  s.onPointerUp(s.event(2, 100, 100))
  assert.equal(s.click().prevented, false)
})

test('reset clears any unfinished gesture', () => {
  const s = setup()
  s.onPointerDown(s.event(1, 100, 100))
  s.onPointerMove(s.event(1, 70, 70))
  s.reset()
  s.onPointerMove(s.event(1, 20, 20))
  assert.equal(s.click().prevented, false)
  assert.equal(s.view.element.scrollLeft, 80)
})
