type RemoteDebuggingCommandLine = {
  appendSwitch(name: string, value?: string): void
}

export function configureRemoteDebugging(
  commandLine: RemoteDebuggingCommandLine,
  env: Record<string, string | undefined> = process.env,
): void {
  const port = env.REMOTE_DEBUGGING_PORT

  if (port === undefined || port.length === 0) {
    return
  }

  commandLine.appendSwitch('remote-debugging-port', port)
}
