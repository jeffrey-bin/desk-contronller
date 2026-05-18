export type AppMode = 'agent' | 'viewer' | 'welcome'

type ModeInput = {
  env?: Record<string, string | undefined>
  stored?: unknown
  packagedName?: string | undefined
}

type UserDataSuffixInput = {
  env?: Record<string, string | undefined>
  mode: AppMode
}

function isPersistedMode(value: unknown): value is Exclude<AppMode, 'welcome'> {
  return value === 'agent' || value === 'viewer'
}

function modeFromPackagedName(value: string | undefined): Exclude<AppMode, 'welcome'> | undefined {
  const normalized = value?.toLowerCase()
  if (normalized?.includes('agent')) {
    return 'agent'
  }
  if (normalized?.includes('viewer')) {
    return 'viewer'
  }
  return undefined
}

export function resolveMode({ env = process.env, stored, packagedName }: ModeInput): AppMode {
  if (isPersistedMode(env.APP_MODE)) {
    return env.APP_MODE
  }

  const packagedMode = modeFromPackagedName(packagedName)
  if (packagedMode !== undefined) {
    return packagedMode
  }

  if (isPersistedMode(stored)) {
    return stored
  }

  return 'welcome'
}

export function resolveUserDataSuffix({
  env = process.env,
  mode,
}: UserDataSuffixInput): string | undefined {
  if (mode === 'welcome') {
    return undefined
  }

  if (env.DESK_USER_DATA_SUFFIX !== undefined && env.DESK_USER_DATA_SUFFIX.length > 0) {
    return env.DESK_USER_DATA_SUFFIX
  }

  if (env.NODE_ENV === 'development') {
    return mode
  }

  return undefined
}
