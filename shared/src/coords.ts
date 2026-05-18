export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export function computeContentRect(
  domW: number,
  domH: number,
  videoW: number,
  videoH: number,
): Rect {
  if (
    !Number.isFinite(domW) ||
    !Number.isFinite(domH) ||
    !Number.isFinite(videoW) ||
    !Number.isFinite(videoH) ||
    domW <= 0 ||
    domH <= 0 ||
    videoW <= 0 ||
    videoH <= 0
  ) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }

  const domRatio = domW / domH
  const videoRatio = videoW / videoH

  if (domRatio > videoRatio) {
    const h = domH
    const w = domH * videoRatio

    return { x: (domW - w) / 2, y: 0, w, h }
  }

  const w = domW
  const h = domW / videoRatio

  return { x: 0, y: (domH - h) / 2, w, h }
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) {
    return 0
  }
  if (n > 1) {
    return 1
  }
  return n
}

export function normalizedToScreen(point: Point, display: Size): Point {
  const width = Number.isFinite(display.width) && display.width > 0 ? display.width : 0
  const height = Number.isFinite(display.height) && display.height > 0 ? display.height : 0

  return {
    x: Math.round(clamp01(point.x) * width),
    y: Math.round(clamp01(point.y) * height),
  }
}
