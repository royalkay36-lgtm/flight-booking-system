import { useLayoutEffect, useRef, useState } from 'react'

export const MIN_ZOOM = 0.75
export const MAX_ZOOM = 3
export const clampZoom = value => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
const PADDING = 16

function planeOffset(view, zoom) {
  return Math.max(PADDING, (view.element.clientWidth - view.planeWidth * view.fit * zoom) / 2)
}

// Chỉ điều khiển khung nhìn. Callback chọn ghế nằm hoàn toàn trong SeatMap.
export function createSeatMapGestures(getView, applyView) {
  const pointers = new Map()
  let gesture = null
  let suppressClick = false
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

  function startPan(point) {
    const { element } = getView()
    gesture = { type: 'pan', start: point, left: element.scrollLeft, top: element.scrollTop }
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (pointers.size === 0 || pointers.has(event.pointerId)) {
      pointers.clear()
      suppressClick = false
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.values()]
    if (points.length === 1) startPan(points[0])
    if (points.length === 2) {
      const view = getView()
      const rect = view.element.getBoundingClientRect()
      const mid = midpoint(...points)
      const scale = view.fit * view.zoom
      gesture = {
        type: 'pinch', distance: Math.max(1, distance(...points)), zoom: view.zoom,
        anchorX: (view.element.scrollLeft + mid.x - rect.left - planeOffset(view, view.zoom)) / scale,
        anchorY: (view.element.scrollTop + mid.y - rect.top - PADDING) / scale,
      }
      suppressClick = true
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId) || !gesture) return
    const point = { x: event.clientX, y: event.clientY }
    pointers.set(event.pointerId, point)
    const view = getView()
    if (gesture.type === 'pinch' && pointers.size === 2) {
      event.preventDefault()
      const points = [...pointers.values()]
      const mid = midpoint(...points)
      const rect = view.element.getBoundingClientRect()
      const zoom = clampZoom(gesture.zoom * distance(...points) / gesture.distance)
      applyView(zoom, {
        left: gesture.anchorX * view.fit * zoom + planeOffset(view, zoom) - (mid.x - rect.left),
        top: gesture.anchorY * view.fit * zoom + PADDING - (mid.y - rect.top),
      })
    } else if (gesture.type === 'pan') {
      if (!suppressClick && distance(point, gesture.start) < 6) return
      suppressClick = true
      event.preventDefault()
      view.element.setPointerCapture?.(event.pointerId)
      view.element.scrollLeft = gesture.left - (point.x - gesture.start.x)
      view.element.scrollTop = gesture.top - (point.y - gesture.start.y)
    }
  }

  function endPointer(event, cancelled = false) {
    pointers.delete(event.pointerId)
    if (cancelled) suppressClick = true
    if (pointers.size === 1) startPan([...pointers.values()][0])
    if (pointers.size === 0) gesture = null
  }

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: event => endPointer(event),
      onPointerCancel: event => endPointer(event, true),
      onLostPointerCapture: event => { if (pointers.has(event.pointerId)) endPointer(event, true) },
      onClickCapture: event => {
        const pointer = event.pointerType || event.nativeEvent?.pointerType
        if (suppressClick && (event.detail !== 0 || pointer)) { event.preventDefault(); event.stopPropagation() }
      },
    },
    reset: () => { pointers.clear(); gesture = null; suppressClick = false },
  }
}

export default function useSeatMapViewport(planeWidth, flightId) {
  const viewportRef = useRef(null)
  const planeRef = useRef(null)
  const pendingScroll = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const fit = Math.min(1, Math.max(1, size.width - PADDING * 2) / planeWidth)
  const scale = fit * zoom
  const latest = useRef(null)
  latest.current = { element: viewportRef.current, zoom, fit, planeWidth }

  function applyView(nextZoom, scroll) {
    const value = clampZoom(nextZoom)
    if (latest.current.zoom === value) {
      latest.current.element.scrollLeft = scroll.left
      latest.current.element.scrollTop = scroll.top
    } else {
      pendingScroll.current = scroll
      latest.current.zoom = value
      setZoom(value)
    }
  }

  const gesturesRef = useRef(null)
  if (!gesturesRef.current) gesturesRef.current = createSeatMapGestures(() => latest.current, applyView)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const plane = planeRef.current
    latest.current.element = viewport
    const observer = new ResizeObserver(() => {
      setSize(previous => {
        const width = viewport.clientWidth
        const height = plane.offsetHeight
        return previous.width === width && previous.height === height ? previous : { width, height }
      })
    })
    observer.observe(viewport)
    observer.observe(plane)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const scroll = pendingScroll.current
    if (scroll) {
      viewportRef.current.scrollLeft = scroll.left
      viewportRef.current.scrollTop = scroll.top
      pendingScroll.current = null
    }
  }, [zoom, size.width, size.height])

  function reset() {
    gesturesRef.current.reset()
    applyView(1, { left: 0, top: 0 })
  }

  useLayoutEffect(() => { reset() }, [flightId]) // eslint-disable-line react-hooks/exhaustive-deps

  function zoomBy(delta) {
    const view = latest.current
    const next = clampZoom(view.zoom + delta)
    const x = view.element.clientWidth / 2
    const y = view.element.clientHeight / 2
    const factor = next / view.zoom
    applyView(next, {
      left: (view.element.scrollLeft + x - planeOffset(view, view.zoom)) * factor + planeOffset(view, next) - x,
      top: (view.element.scrollTop + y - PADDING) * factor + PADDING - y,
    })
  }

  return {
    viewportRef, planeRef, zoom, zoomBy, reset, handlers: gesturesRef.current.handlers,
    canvasStyle: { width: Math.max(size.width, planeWidth * scale + PADDING * 2), height: size.height * scale + PADDING * 2 },
    planeStyle: { width: planeWidth, transform: `scale(${scale})`, left: Math.max(PADDING, (size.width - planeWidth * scale) / 2) },
  }
}
