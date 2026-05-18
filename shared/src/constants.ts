export const PROTOCOL_VERSION = 1 as const

export const PAIR_CODE_LENGTH = 6
export const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const PAIR_CODE_TTL_MS = 5 * 60_000
export const PAIR_MAX_ATTEMPTS = 3
export const PAIR_LOCKOUT_MS = 60_000

export const KEEPALIVE_INTERVAL_MS = 3_000
export const KEEPALIVE_TIMEOUT_MS = 10_000
export const ICE_GATHERING_TIMEOUT_MS = 10_000

export const VIDEO_MAX_BITRATE_BPS = 8_000_000
export const VIDEO_MAX_FRAMERATE = 60
export const VIDEO_RN_ANDROID_SCALE_DOWN_BY = 2

export const MOUSE_THROTTLE_MIN_INTERVAL_MS = 8
export const MOUSE_BUFFER_THRESHOLD_BYTES = 64 * 1024
export const MODIFIER_SYNC_INTERVAL_MS = 1_000

export const MDNS_SERVICE_TYPE = 'remote-desktop'
export const MDNS_PROTOCOL = 'tcp' as const

export const DC_MOUSE_LABEL = 'mouse'
export const DC_KEYBOARD_LABEL = 'keyboard'

export const QUIT_CLEANUP_TIMEOUT_MS = 2_000
