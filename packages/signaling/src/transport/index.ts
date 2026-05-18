import type { SignalingMessage } from '@desk/shared'

export type ConnectionState = 'open' | 'closed' | 'error'
export type Unsubscribe = () => void

export interface SignalingTransport {
  start(): Promise<void>
  stop(): Promise<void>
  send(msg: SignalingMessage): void
  onMessage(handler: (msg: SignalingMessage) => void): Unsubscribe
  onConnectionState(handler: (s: ConnectionState) => void): Unsubscribe
}
