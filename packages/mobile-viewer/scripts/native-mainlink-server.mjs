import process from 'node:process'
import { WebSocket, WebSocketServer } from 'ws'

const port = Number(process.env.DESK_MOBILE_E2E_PORT ?? '49831')
const host = process.env.DESK_MOBILE_E2E_BIND_HOST ?? '0.0.0.0'
const roomId = process.env.DESK_MOBILE_E2E_ROOM ?? 'RNM2E2'
const pairCode = process.env.DESK_MOBILE_E2E_PAIR_CODE ?? roomId

const peers = new Map()
const rooms = new Map()
const server = new WebSocketServer({ host, port })

server.on('connection', (socket) => {
  socket.on('message', (data) => {
    handleMessage(socket, String(data))
  })
  socket.on('close', () => removePeer(socket))
  socket.on('error', () => removePeer(socket))
})

server.once('listening', () => {
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  startAgent(actualPort)
  console.log(JSON.stringify({ event: 'ready', host, port: actualPort, roomId, pairCode }))
})

function handleMessage(socket, raw) {
  let message
  try {
    message = JSON.parse(raw)
  } catch {
    return
  }

  const peer = peers.get(socket)
  if (!peer) {
    if (message.t !== 'join-room' && message.t !== 'hello') {
      return
    }

    const joined = {
      socket,
      roomId: message.t === 'join-room' ? message.roomId : roomId,
      role: message.role,
      clientId: message.clientId,
    }
    peers.set(socket, joined)
    const room = rooms.get(joined.roomId) ?? {}
    room[joined.role] = joined
    rooms.set(joined.roomId, room)
    return
  }

  if (message.t === 'join-room') {
    return
  }

  const targetRole = peer.role === 'agent' ? 'viewer' : 'agent'
  const target = rooms.get(peer.roomId)?.[targetRole]
  if (target?.socket.readyState === WebSocket.OPEN) {
    target.socket.send(JSON.stringify(message))
  }
}

function removePeer(socket) {
  const peer = peers.get(socket)
  if (!peer) {
    return
  }

  peers.delete(socket)
  const room = rooms.get(peer.roomId)
  if (!room) {
    return
  }

  if (room[peer.role]?.socket === socket) {
    delete room[peer.role]
  }

  if (!room.agent && !room.viewer) {
    rooms.delete(peer.roomId)
  }
}

function startAgent(actualPort) {
  const agent = new WebSocket(`ws://127.0.0.1:${actualPort}`)

  agent.once('open', () => {
    agent.send(
      JSON.stringify({
        v: 1,
        t: 'join-room',
        roomId,
        role: 'agent',
        clientId: 'native-e2e-agent',
      }),
    )
  })

  agent.on('message', (data) => {
    const message = JSON.parse(String(data))

    if (message.t === 'pair-request' && message.code === pairCode) {
      agent.send(JSON.stringify({ v: 1, t: 'pair-result', ok: true }))
      agent.send(JSON.stringify({ v: 1, t: 'offer', sdp: 'native-e2e-offer' }))
      agent.send(
        JSON.stringify({
          v: 1,
          t: 'ice',
          candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' },
        }),
      )
      return
    }

    if (message.t === 'answer') {
      console.log(JSON.stringify({ event: 'answer', sdp: message.sdp }))
    }
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

function shutdown() {
  for (const peer of peers.values()) {
    peer.socket.close()
  }
  server.close(() => process.exit(0))
}
