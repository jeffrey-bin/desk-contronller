import { systemPreferences } from 'electron'

type Platform = NodeJS.Platform

type PermissionProbe = {
  getMediaAccessStatus(mediaType: 'screen'): string
  isTrustedAccessibilityClient(prompt: boolean): boolean
}

export type AgentPermissionResult = {
  screen: boolean
  accessibility: boolean
}

export async function checkAgentPermissionsForPlatform(
  platform: Platform,
  probe: PermissionProbe,
): Promise<AgentPermissionResult> {
  if (platform !== 'darwin') {
    return { screen: true, accessibility: true }
  }

  return {
    screen: probe.getMediaAccessStatus('screen') === 'granted',
    accessibility: probe.isTrustedAccessibilityClient(false),
  }
}

export function checkAgentPermissions(): Promise<AgentPermissionResult> {
  return checkAgentPermissionsForPlatform(process.platform, systemPreferences)
}
