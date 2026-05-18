import { parseSignalingMessage } from '@desk/shared'
import type { SignalingMessage } from '@desk/shared'

export type DecodeResult =
  | { ok: true; value: SignalingMessage }
  | { ok: false; reason: 'invalid-json' | 'invalid-schema' }

export function encodeMessage(msg: SignalingMessage): string {
  return JSON.stringify(msg)
}

export function decodeMessage(raw: string): DecodeResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }

  const result = parseSignalingMessage(parsed)

  if (!result.ok) {
    return { ok: false, reason: 'invalid-schema' }
  }

  return { ok: true, value: result.value }
}
