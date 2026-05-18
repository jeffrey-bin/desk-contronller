import { describe, expect, it } from 'vitest'

import { isAllowedNavigationUrl } from '../src/main/navigation-policy.js'

describe('navigation policy', () => {
  it('allows expected packaged renderer file URLs under the allowed root', () => {
    expect(
      isAllowedNavigationUrl(
        'file:///app/out/renderer/viewer.html',
        undefined,
        '/app/out/renderer',
      ),
    ).toBe(true)
  })

  it('rejects local file URLs outside the allowed renderer root', () => {
    expect(isAllowedNavigationUrl('file:///etc/passwd', undefined, '/app/out/renderer')).toBe(false)
  })

  it('allows configured electron-vite dev origin', () => {
    expect(
      isAllowedNavigationUrl('http://localhost:5173/viewer.html', 'http://localhost:5173'),
    ).toBe(true)
  })

  it('denies external navigation and window-open targets', () => {
    expect(isAllowedNavigationUrl('https://example.com', 'http://localhost:5173')).toBe(false)
    expect(isAllowedNavigationUrl('http://evil.test/viewer.html', 'http://localhost:5173')).toBe(
      false,
    )
  })
})
