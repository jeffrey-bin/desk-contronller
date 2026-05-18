import { z } from 'zod'

import { PROTOCOL_VERSION } from '../constants.js'
import type { ParseResult } from './signaling.js'

export const Mods = {
  Shift: 1,
  Ctrl: 2,
  Alt: 4,
  Meta: 8,
} as const

const VersionSchema = z.literal(PROTOCOL_VERSION)
const ButtonSchema = z.union([z.literal(0), z.literal(1), z.literal(2)])
const NormalizedCoordinateSchema = z.number().finite().min(0).max(1)
const DeltaSchema = z.number().finite()
const ModifierMaskSchema = z.number().int().min(0).max(15)

export const MouseMsgSchema = z.discriminatedUnion('t', [
  z.object({
    v: VersionSchema,
    t: z.literal('mm'),
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('md'),
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
    b: ButtonSchema,
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('mu'),
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
    b: ButtonSchema,
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('mw'),
    x: NormalizedCoordinateSchema,
    y: NormalizedCoordinateSchema,
    dx: DeltaSchema,
    dy: DeltaSchema,
  }),
])

export const KeyMsgSchema = z.discriminatedUnion('t', [
  z.object({
    v: VersionSchema,
    t: z.literal('kd'),
    code: z.string().min(1),
    mods: ModifierMaskSchema,
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('ku'),
    code: z.string().min(1),
    mods: ModifierMaskSchema,
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('sync'),
    mods: ModifierMaskSchema,
    keys: z.array(z.string()),
  }),
  z.object({
    v: VersionSchema,
    t: z.literal('rk'),
  }),
])

export type MouseMsg = z.infer<typeof MouseMsgSchema>
export type KeyMsg = z.infer<typeof KeyMsgSchema>

export function parseMouseMsg(raw: unknown): ParseResult<MouseMsg> {
  const result = MouseMsgSchema.safeParse(raw)

  if (result.success) {
    return { ok: true, value: result.data }
  }

  return { ok: false, error: result.error }
}

export function parseKeyMsg(raw: unknown): ParseResult<KeyMsg> {
  const result = KeyMsgSchema.safeParse(raw)

  if (result.success) {
    return { ok: true, value: result.data }
  }

  return { ok: false, error: result.error }
}

export function encodeMods(input: {
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
  meta?: boolean
}): number {
  let mask = 0

  if (input.shift === true) {
    mask |= Mods.Shift
  }
  if (input.ctrl === true) {
    mask |= Mods.Ctrl
  }
  if (input.alt === true) {
    mask |= Mods.Alt
  }
  if (input.meta === true) {
    mask |= Mods.Meta
  }

  return mask
}

export function decodeMods(mask: number): {
  shift: boolean
  ctrl: boolean
  alt: boolean
  meta: boolean
} {
  return {
    shift: (mask & Mods.Shift) !== 0,
    ctrl: (mask & Mods.Ctrl) !== 0,
    alt: (mask & Mods.Alt) !== 0,
    meta: (mask & Mods.Meta) !== 0,
  }
}
