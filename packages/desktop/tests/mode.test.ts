import { describe, expect, it } from 'vitest'

import { resolveMode, resolveUserDataSuffix } from '../src/main/mode.js'

describe('resolveMode', () => {
  it('uses APP_MODE=agent over stored mode', () => {
    expect(resolveMode({ env: { APP_MODE: 'agent' }, stored: 'viewer' })).toBe('agent')
  })

  it('uses APP_MODE=viewer over stored mode', () => {
    expect(resolveMode({ env: { APP_MODE: 'viewer' }, stored: 'agent' })).toBe('viewer')
  })

  it('ignores garbage APP_MODE and falls back to stored agent', () => {
    expect(resolveMode({ env: { APP_MODE: 'banana' }, stored: 'agent' })).toBe('agent')
  })

  it('falls back to stored viewer', () => {
    expect(resolveMode({ stored: 'viewer' })).toBe('viewer')
  })

  it('uses welcome when no valid override or stored mode exists', () => {
    expect(resolveMode({ env: { APP_MODE: 'banana' }, stored: 'banana' })).toBe('welcome')
  })
})

describe('resolveUserDataSuffix', () => {
  it('uses DESK_USER_DATA_SUFFIX when provided', () => {
    expect(
      resolveUserDataSuffix({
        env: { DESK_USER_DATA_SUFFIX: 'e2e-agent-123', NODE_ENV: 'production' },
        mode: 'agent',
      }),
    ).toBe('e2e-agent-123')
  })

  it('keeps the existing development mode suffix', () => {
    expect(resolveUserDataSuffix({ env: { NODE_ENV: 'development' }, mode: 'viewer' })).toBe(
      'viewer',
    )
  })

  it('does not suffix welcome mode', () => {
    expect(
      resolveUserDataSuffix({
        env: { DESK_USER_DATA_SUFFIX: 'e2e-welcome', NODE_ENV: 'development' },
        mode: 'welcome',
      }),
    ).toBeUndefined()
  })

  it('does not suffix production apps by default', () => {
    expect(
      resolveUserDataSuffix({ env: { NODE_ENV: 'production' }, mode: 'agent' }),
    ).toBeUndefined()
  })
})
