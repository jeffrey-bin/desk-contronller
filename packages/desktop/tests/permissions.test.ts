import { describe, expect, it } from 'vitest'

import { checkAgentPermissionsForPlatform } from '../src/main/agent/permissions.js'

describe('checkAgentPermissionsForPlatform', () => {
  it('uses macOS screen and accessibility probes', async () => {
    await expect(
      checkAgentPermissionsForPlatform('darwin', {
        getMediaAccessStatus: () => 'granted',
        isTrustedAccessibilityClient: () => false,
      }),
    ).resolves.toEqual({ screen: true, accessibility: false })
  })

  it('treats non-macOS platforms as allowed for M1 probing', async () => {
    await expect(
      checkAgentPermissionsForPlatform('linux', {
        getMediaAccessStatus: () => 'denied',
        isTrustedAccessibilityClient: () => false,
      }),
    ).resolves.toEqual({ screen: true, accessibility: true })
  })
})
