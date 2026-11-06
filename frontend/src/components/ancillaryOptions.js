export function hasServicePrice(value) {
  return (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' &&
    Number.isFinite(Number(value)) && Number(value) >= 0
}

export function unavailableReason(product, passengerType, international, internationalKnown) {
  if (product.is_active === false) return 'Dịch vụ tạm ngừng'
  if (!hasServicePrice(product.price)) return 'Chưa có giá xác định'
  if (passengerType === 'INFANT' && product.category !== 'INSURANCE') return 'Không áp dụng cho em bé'
  if (product.international_only && !internationalKnown) return 'Chưa xác định được phạm vi quốc tế của hành trình'
  if (product.international_only && !international) return 'Chỉ áp dụng cho hành trình quốc tế'
  return ''
}

// Mỗi khách chỉ chọn một gói trong cùng nhóm và cùng phạm vi, đúng cấu trúc API hiện có.
export function chooseAncillary(ancillaries, products, category, segment, code) {
  const byCode = Object.fromEntries(products.map(product => [product.code, product]))
  const product = byCode[code]
  if (code && (!product || product.category !== category || product.per_segment !== (segment !== null))) return ancillaries
  const remaining = ancillaries.filter(item =>
    byCode[item.code]?.category !== category || (item.segment ?? null) !== segment)
  return code ? [...remaining, { code, segment }] : remaining
}
