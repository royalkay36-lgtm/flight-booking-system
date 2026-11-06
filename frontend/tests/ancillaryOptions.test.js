import test from 'node:test'
import assert from 'node:assert/strict'
import { hasServicePrice, unavailableReason, chooseAncillary } from '../src/components/ancillaryOptions.js'

const products = [
  { code: 'BAG20', category: 'BAGGAGE', price: '180000.00', per_segment: true },
  { code: 'BAG30', category: 'BAGGAGE', price: '260000.00', per_segment: true },
  { code: 'MEAL_PHO', category: 'MEAL', price: '80000.00', per_segment: true },
  { code: 'INS_TRIP', category: 'INSURANCE', price: '70000.00', per_segment: false },
  { code: 'SIM_KR', category: 'SIM', price: '250000.00', per_segment: false, international_only: true },
]

test('missing, malformed and negative prices are never displayed as free', () => {
  for (const value of [null, undefined, '', '  ', 'invalid', false, -1, Infinity, NaN]) assert.equal(hasServicePrice(value), false)
  for (const value of [0, '0.00', '180000.00', 180000]) assert.equal(hasServicePrice(value), true)
})

test('international-only services require a known international itinerary', () => {
  const sim = products.find(product => product.code === 'SIM_KR')
  assert.match(unavailableReason(sim, 'ADULT', false, true), /quốc tế/)
  assert.match(unavailableReason(sim, 'ADULT', false, false), /Chưa xác định/)
  assert.equal(unavailableReason(sim, 'ADULT', true, true), '')
})

test('infant availability follows the existing booking UI', () => {
  for (const product of products) {
    const reason = unavailableReason(product, 'INFANT', true, true)
    assert.equal(reason === '', product.category === 'INSURANCE')
  }
})

test('inactive services and unknown prices cannot be selected', () => {
  assert.match(unavailableReason({ ...products[0], is_active: false }, 'ADULT', true, true), /tạm ngừng/)
  assert.match(unavailableReason({ ...products[0], price: null }, 'ADULT', true, true), /Chưa có giá/)
})

test('choosing a second package replaces only the same category and segment', () => {
  const original = [{ code: 'BAG20', segment: 0 }, { code: 'BAG20', segment: 1 }, { code: 'INS_TRIP', segment: null }]
  const next = chooseAncillary(original, products, 'BAGGAGE', 0, 'BAG30')
  assert.deepEqual(next, [{ code: 'BAG20', segment: 1 }, { code: 'INS_TRIP', segment: null }, { code: 'BAG30', segment: 0 }])
  assert.equal(original[0].code, 'BAG20')
})

test('rapid repeated choices cannot produce duplicate packages', () => {
  let selected = []
  for (let i = 0; i < 100; i += 1) selected = chooseAncillary(selected, products, 'BAGGAGE', 0, 'BAG20')
  assert.deepEqual(selected, [{ code: 'BAG20', segment: 0 }])
})

test('clearing a package preserves other choices and an omitted trip segment', () => {
  const selected = [{ code: 'BAG20', segment: 0 }, { code: 'INS_TRIP' }]
  assert.deepEqual(chooseAncillary(selected, products, 'BAGGAGE', 0, ''), [{ code: 'INS_TRIP' }])
  assert.deepEqual(chooseAncillary(selected, products, 'INSURANCE', null, ''), [{ code: 'BAG20', segment: 0 }])
})

test('the exact API representation is kept for trip and segment selections', () => {
  let selected = chooseAncillary([], products, 'SIM', null, 'SIM_KR')
  selected = chooseAncillary(selected, products, 'MEAL', 1, 'MEAL_PHO')
  assert.deepEqual(selected, [{ code: 'SIM_KR', segment: null }, { code: 'MEAL_PHO', segment: 1 }])
  assert.deepEqual(Object.keys(selected[0]).sort(), ['code', 'segment'])
})

test('unknown codes, categories and scopes do not corrupt a valid selection', () => {
  const selected = [{ code: 'INS_TRIP', segment: null }]
  assert.equal(chooseAncillary(selected, products, 'SIM', null, 'MISSING'), selected)
  assert.equal(chooseAncillary(selected, products, 'MEAL', 0, 'BAG20'), selected)
  assert.equal(chooseAncillary(selected, products, 'INSURANCE', 0, 'INS_TRIP'), selected)
  assert.equal(chooseAncillary(selected, [], 'MEAL', 0, 'MEAL_PHO'), selected)
})
