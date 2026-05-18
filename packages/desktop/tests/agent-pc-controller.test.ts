import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createRemoteIceBuffer } from '../src/renderer/shared/webrtc/remote-ice-buffer.js'

class FakePeerConnection {
  remoteDescription: unknown | null = null
  readonly added: unknown[] = []

  async addIceCandidate(candidate: unknown): Promise<void> {
    if (this.remoteDescription === null) {
      throw new Error('remote description missing')
    }
    this.added.push(candidate)
  }
}

describe('createAgentPeerController', () => {
  it('reports connected and failed peer states to main', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/renderer/agent/pc-controller.ts'),
      'utf8',
    )

    expect(source).toContain('pc.onconnectionstatechange')
    expect(source).toContain('pc.oniceconnectionstatechange')
    expect(source).toContain('api.reportPeerConnectionState(pc.connectionState)')
    expect(source).toContain('api.reportPeerConnectionState(pc.iceConnectionState)')
    expect(source).toContain('Dropped invalid mouse control message')
    expect(source).toContain('Dropped invalid keyboard control message')
  })
})

describe('remote ICE buffering', () => {
  it('buffers agent-side candidates until remote description exists', async () => {
    const pc = new FakePeerConnection()
    const buffer = createRemoteIceBuffer(pc)
    const candidate = { candidate: 'candidate:agent', sdpMid: '0' }

    await expect(buffer.add(candidate)).resolves.toBeUndefined()
    expect(pc.added).toEqual([])

    pc.remoteDescription = { type: 'answer', sdp: 'answer' }
    await buffer.flush()

    expect(pc.added).toEqual([candidate])
  })

  it('buffers viewer-side candidates until remote description exists', async () => {
    const pc = new FakePeerConnection()
    const buffer = createRemoteIceBuffer(pc)
    const candidate = { candidate: 'candidate:viewer', sdpMid: '0' }

    await expect(buffer.add(candidate)).resolves.toBeUndefined()
    expect(pc.added).toEqual([])

    pc.remoteDescription = { type: 'offer', sdp: 'offer' }
    await buffer.flush()

    expect(pc.added).toEqual([candidate])
  })
})

describe('createViewerPeerController', () => {
  it('reports peer states and sends bye on terminal states', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/renderer/viewer/pc-controller.ts'),
      'utf8',
    )

    expect(source).toContain('pc.onconnectionstatechange')
    expect(source).toContain('pc.oniceconnectionstatechange')
    expect(source).toContain('api.reportPeerConnectionState')
    expect(source).toContain("t: 'bye'")
    expect(source).toContain('stopStats()')
  })
})
