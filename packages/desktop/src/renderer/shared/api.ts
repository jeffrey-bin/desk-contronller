import type { AgentApi, ViewerApi, WelcomeApi } from '../../shared/api-types.js'

declare global {
  interface Window {
    api?: AgentApi | ViewerApi | WelcomeApi
  }
}

function requireApi<T>(label: string): T {
  if (window.api === undefined) {
    throw new Error(`${label} preload api is unavailable`)
  }

  return window.api as T
}

export function getAgentApi(): AgentApi {
  return requireApi<AgentApi>('agent')
}

export function getViewerApi(): ViewerApi {
  return requireApi<ViewerApi>('viewer')
}

export function getWelcomeApi(): WelcomeApi {
  return requireApi<WelcomeApi>('welcome')
}
