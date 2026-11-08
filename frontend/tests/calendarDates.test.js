import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays, addMonths, addMonthsKeepDay, daysInMonth, longLabel, monthLabel, monthWeeks, shortLabel, shortPrice, weekdayIndex,
} from '../src/components/calendarDates.js'

test('cộng ngày và tháng qua ranh giới tháng, năm, năm nhuận', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addMonths('2026-12', 1), '2027-01')
  assert.equal(addMonths('2026-01', -1), '2025-12')
  assert.equal(daysInMonth('2028-02'), 29)
  assert.equal(addMonthsKeepDay('2026-01-31', 1), '2026-02-28')
})

test('tuần bắt đầu từ thứ Hai, ô ngoài tháng là null', () => {
  assert.equal(weekdayIndex('2026-11-09'), 0) // thứ Hai
  assert.equal(weekdayIndex('2026-11-15'), 6) // Chủ nhật
  const weeks = monthWeeks('2026-11') // 1/11/2026 là Chủ nhật
  assert.deepEqual(weeks[0], [null, null, null, null, null, null, '2026-11-01'])
  assert.equal(weeks.at(-1)[0], '2026-11-30')
  assert.ok(weeks.every((w) => w.length === 7))
})

test('nhãn tiếng Việt và giá rút gọn', () => {
  assert.equal(shortLabel('2026-11-14'), 'T7, 14/11/2026')
  assert.equal(longLabel('2026-11-14'), 'Thứ Bảy, 14 tháng 11 năm 2026')
  assert.equal(monthLabel('2026-11'), 'Tháng 11, 2026')
  assert.equal(shortPrice(990000), '990k')
  assert.equal(shortPrice(1190000), '1,19tr')
  assert.equal(shortPrice(1700000), '1,7tr')
  assert.equal(shortPrice(null), '')
})
