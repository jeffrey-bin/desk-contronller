import { describe, expect, it } from 'vitest'

import { selectVideoCodecPreference } from '../src/renderer/agent/pc-controller.js'

describe('selectVideoCodecPreference', () => {
  it('uses VP8 for Android RN viewers because BlueStacks does not render the H264 stream', () => {
    expect(selectVideoCodecPreference('rn-android-viewer-123')).toBe('VP8')
  })

  it('keeps H264 for iOS RN and desktop viewers', () => {
    expect(selectVideoCodecPreference('rn-ios-viewer-123')).toBe('H264')
    expect(selectVideoCodecPreference('desktop-viewer')).toBe('H264')
  })
})
