export const ErrorCode = {
  E_PAIR_INVALID_CODE: 'E_PAIR_INVALID_CODE',
  E_PAIR_EXPIRED: 'E_PAIR_EXPIRED',
  E_PAIR_TOO_MANY_ATTEMPTS: 'E_PAIR_TOO_MANY_ATTEMPTS',
  E_PEER_BUSY: 'E_PEER_BUSY',
  E_VERSION_MISMATCH: 'E_VERSION_MISMATCH',
  E_PERMISSION_SCREEN: 'E_PERMISSION_SCREEN',
  E_PERMISSION_A11Y: 'E_PERMISSION_A11Y',
  E_ICE_FAILED: 'E_ICE_FAILED',
  E_TRANSPORT_TIMEOUT: 'E_TRANSPORT_TIMEOUT',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

const errorCodes = new Set<string>(Object.values(ErrorCode))

export function isErrorCode(x: unknown): x is ErrorCode {
  return typeof x === 'string' && errorCodes.has(x)
}
