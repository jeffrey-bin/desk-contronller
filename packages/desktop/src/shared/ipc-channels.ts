export const IpcChannels = {
  agentCheckPermissions: 'agent:check-permissions',
  agentGetStatus: 'agent:get-status',
  agentStartSession: 'agent:start-session',
  agentStopSession: 'agent:stop-session',
  agentSendMouse: 'agent:send-mouse',
  agentSendKey: 'agent:send-key',
  agentSendSignal: 'agent:send-signal',
  agentReportPeerConnectionState: 'agent:report-peer-connection-state',
  agentEvents: 'agent:events',
  viewerDiscoverAgents: 'viewer:discover-agents',
  viewerConnect: 'viewer:connect',
  viewerDisconnect: 'viewer:disconnect',
  viewerSendMouse: 'viewer:send-mouse',
  viewerSendKey: 'viewer:send-key',
  viewerSendSignal: 'viewer:send-signal',
  viewerReportPeerConnectionState: 'viewer:report-peer-connection-state',
  viewerEvents: 'viewer:events',
  welcomePickMode: 'welcome:pick-mode',
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]
