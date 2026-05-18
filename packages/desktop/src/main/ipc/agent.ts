import { checkAgentPermissions } from '../agent/permissions.js'
import { IpcChannels } from './channels.js'
import { registerHandler } from './registry.js'

export function registerAgentIpc(): void {
  registerHandler(IpcChannels.agentCheckPermissions, () => checkAgentPermissions())
  registerHandler(IpcChannels.agentGetStatus, () => checkAgentPermissions())
  registerHandler(IpcChannels.agentStartSession, () => undefined)
  registerHandler(IpcChannels.agentStopSession, () => undefined)
}
