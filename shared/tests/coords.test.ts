import { describe, expect, it } from 'vitest'

import { clamp01, computeContentRect, normalizedToScreen } from '../src/coords.js'

describe('coordinate math', () => {
  it('uses full DOM rect when ratios match', () => {
    expect(computeContentRect(800, 400, 1920, 960)).toEqual({ x: 0, y: 0, w: 800, h: 400 })
  })

  it('adds top and bottom bars when video is wider than DOM', () => {
    const rect = computeContentRect(800, 800, 1920, 1080)

    expect(rect.x).toBe(0)
    expect(rect.w).toBe(800)
    expect(rect.y).toBeCloseTo(175, 0)
    expect(rect.h).toBeCloseTo(450, 0)
  })

  it('adds left and right bars when video is taller than DOM', () => {
    const rect = computeContentRect(800, 400, 1080, 1920)

    expect(rect.y).toBe(0)
    expect(rect.h).toBe(400)
    expect(rect.x).toBeCloseTo(287.5, 1)
    expect(rect.w).toBeCloseTo(225, 1)
  })

  it('returns zeros for invalid dimensions', () => {
    expect(computeContentRect(0, 400, 1920, 960)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
    expect(computeContentRect(Number.POSITIVE_INFINITY, 400, 1920, 960)).toEqual({
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    })
    expect(computeContentRect(800, Number.NaN, 1920, 960)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  it('clamps normalized values', () => {
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
  })

  it('maps normalized points to screen coordinates', () => {
    expect(normalizedToScreen({ x: 0.5, y: 0.25 }, { width: 1920, height: 1080 })).toEqual({
      x: 960,
      y: 270,
    })
    expect(normalizedToScreen({ x: -1, y: 2 }, { width: 100, height: 100 })).toEqual({
      x: 0,
      y: 100,
    })
    expect(
      normalizedToScreen(
        { x: Number.POSITIVE_INFINITY, y: Number.NaN },
        { width: Number.POSITIVE_INFINITY, height: Number.NaN },
      ),
    ).toEqual({
      x: 0,
      y: 0,
    })
  })
})
