// Mỗi lần tải chỉ cập nhật khi còn là yêu cầu mới nhất của sơ đồ hiện tại.
export function createSeatMapLoader(fetchSeats, onChange, initial = {}) {
  let state = { seats: [], loaded: false, loading: false, refreshing: false, error: '', ...initial }
  let version = 0
  let stopped = false
  const publish = patch => {
    state = { ...state, ...patch }
    onChange(state)
  }
  return {
    async load() {
      const request = ++version
      publish({ loading: !state.loaded, refreshing: true })
      try {
        const seats = await fetchSeats()
        if (!Array.isArray(seats)) throw new Error('Dữ liệu sơ đồ ghế không hợp lệ')
        if (stopped || request !== version) return
        publish({ seats, loaded: true, loading: false, refreshing: false, error: '' })
        return seats
      } catch (error) {
        if (!stopped && request === version) publish({ loading: false, refreshing: false,
          error: `Không tải được sơ đồ ghế. ${error.message}` })
      }
    },
    stop() { stopped = true; version += 1 },
  }
}
