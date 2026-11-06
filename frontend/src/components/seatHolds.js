// Giữ ghế mới trước; lỗi nhả ghế cũ phải được trả lại để UI tiếp tục xử lý.
export async function replaceSeatHold(request, previous, next) {
  await request(`/seats/${next}/hold`, { method: 'POST' })
  if (previous && previous !== next) {
    try {
      await request(`/seats/${previous}/hold`, { method: 'DELETE' })
    } catch (error) {
      return { pendingRelease: previous, error: error.message }
    }
  }
  return { pendingRelease: null }
}

// Chỉ đồng bộ trạng thái giữ ghế; tiền vẫn do quote của backend tính.
export function reconcileSeatHolds(passengers, segment, seats) {
  const owned = new Set(seats.filter(seat => seat.mine).map(seat => seat.flight_seat_id))
  const lost = []
  const next = passengers.map((passenger, index) => {
    const selected = passenger.seat_ids[segment]
    if (!selected || owned.has(selected)) return passenger
    lost.push(index)
    return { ...passenger, seat_ids: passenger.seat_ids.map((id, leg) => leg === segment ? null : id) }
  })
  return { passengers: lost.length ? next : passengers, lost }
}
