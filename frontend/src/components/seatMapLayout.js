// Các dải ghế và hàng thoát hiểm đã xác định trong database/03_seed.sql.
const SEED_LAYOUTS = [
  { exits: [12, 13], cabins: [
    ['ECONOMY', 1, 3, 'ABC-DEF', 150000], ['ECONOMY', 4, 11, 'ABC-DEF', 60000],
    ['ECONOMY', 12, 13, 'ABC-DEF', 200000], ['ECONOMY', 14, 30, 'ABC-DEF', 40000],
  ] },
  { exits: [16, 17], cabins: [
    ['BUSINESS', 1, 4, 'AC-DF', 0], ['ECONOMY', 5, 7, 'ABC-DEF', 150000],
    ['ECONOMY', 8, 15, 'ABC-DEF', 60000], ['ECONOMY', 16, 17, 'ABC-DEF', 200000],
    ['ECONOMY', 18, 32, 'ABC-DEF', 40000],
  ] },
  { exits: [26], cabins: [
    ['BUSINESS', 1, 7, 'A-DG-K', 0], ['ECONOMY', 10, 12, 'ABC-DEF-HJK', 150000],
    ['ECONOMY', 13, 25, 'ABC-DEF-HJK', 60000], ['ECONOMY', 26, 26, 'ABC-DEF-HJK', 200000],
    ['ECONOMY', 27, 38, 'ABC-DEF-HJK', 40000],
  ] },
]

const signature = (cabin, row, letter, col, fee) => `${cabin}/${row}/${letter}/${col}/${Number(fee)}`

const knownLayouts = SEED_LAYOUTS.map(({ cabins, exits }) => {
  const seats = new Set()
  for (const [cabin, first, last, columns, fee] of cabins) {
    for (let row = first; row <= last; row += 1) {
      Array.from(columns).forEach((letter, col) => {
        if (letter !== '-') seats.add(signature(cabin, row, letter, col + 1, fee))
      })
    }
  }
  return { seats, exits }
})

export function getSeedExitRows(seats) {
  const layout = knownLayouts.find(known => known.seats.size === seats.length && seats.every(seat =>
    known.seats.has(signature(seat.cabin_class, seat.seat_row, seat.seat_letter, seat.grid_col, seat.seat_fee))))
  return layout ? new Set(layout.exits) : null
}
