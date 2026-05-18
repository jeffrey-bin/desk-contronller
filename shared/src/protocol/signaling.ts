import { z } from 'zod'

import { PROTOCOL_VERSION } from '../constants.js'
import { ErrorCode } from './errors.js'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: z.ZodError }

const VersionSchema = z.literal(PROTOCOL_VERSION)
const ErrorCodeSchema = z.enum([
  ErrorCode.E_PAIR_INVALID_CODE,
  ErrorCode.E_PAIR_EXPIRED,
  ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS,
  ErrorCode.E_PEER_BUSY,
  ErrorCode.E_VERSION_MISMATCH,
  ErrorCode.E_PERMISSION_SCREEN,
  ErrorCode.E_PERMISSION_A11Y,
  ErrorCode.E_ICE_FAILED,
  ErrorCode.E_TRANSPORT_TIMEOUT,
])

const IceCandidateSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().int().nonnegative().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
})

export const SignalingMessageSchema = z.discriminatedUnion('t', [
  z.object({
    v: VersionSchema,
    t: z.literal('hello'),
    role: z.enum(['agent', 'viewer']),
    clientId: z.string(),
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('join-room'),
    roomId: z.string().min(1),
    role: z.enum(['agent', 'viewer']),
    clientId: z.string().min(1),
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('pair-request'),
    code: z.string(),
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('pair-result'),
    ok: z.boolean(),
    reason: ErrorCodeSchema.optional(),
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('offer'),
    sdp: z.string(),
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('answer'),
    sdp: z.string(),
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('ice'),
    candidate: IceCandidateSchema,
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('bye'),
    reason: z.string().optional(),
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('ping'),
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('pong'),
  }),
])

export type SignalingMessage = z.infer<typeof SignalingMessageSchema>

export function parseSignalingMessage(raw: unknown): ParseResult<SignalingMessage> {
  const result = SignalingMessageSchema.safeParse(raw)

  if (result.success) {
    return { ok: true, value: result.data }
  }

  return { ok: false, error: result.error }
}
