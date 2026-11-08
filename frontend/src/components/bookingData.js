// Bước hành khách không được mắc kẹt vì voucher/dịch vụ/ghế đã chọn ở bước sau.
export function passengerValidationBody(body) {
  return { ...body, voucher_code: null, passengers: body.passengers.map(passenger => ({
    ...passenger, seat_ids: body.flights.map(() => null), ancillaries: [],
  })) }
}
