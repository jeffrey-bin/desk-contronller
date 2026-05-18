# Remote Desktop M2-a Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Scope

M2-a adds a public rendezvous signaling path while keeping the M1 LAN path intact.

In scope:

- Add a `join-room` signaling message.
- Implement a stateless `packages/relay-server` package using `ws`.
- Implement `RelayClientTransport` in `packages/desktop/src/main/signaling`.
- Prove two relay clients can join the same room and exchange existing SDP/ICE/pairing messages.

Out of scope:

- React Native mobile Viewer.
- Desktop UI for relay configuration.
- TURN provisioning UI.
- Protocol version bump.
- Clipboard, file transfer, audio, multi-screen.

## File Map

- `shared/src/protocol/signaling.ts` — add `join-room` schema and type.
- `shared/tests/signaling.test.ts` — cover `join-room` parse success/failure and no `PROTOCOL_VERSION` bump.
- `packages/relay-server/package.json` — workspace package scaffold.
- `packages/relay-server/tsconfig.json` — strict TypeScript config.
- `packages/relay-server/vitest.config.ts` — Vitest config.
- `packages/relay-server/src/server.ts` — relay room registry and WebSocket server.
- `packages/relay-server/src/index.ts` — exports for tests and future CLI.
- `packages/relay-server/tests/server.test.ts` — room join/routing/busy/disconnect tests.
- `packages/desktop/src/main/signaling/relay-client.ts` — real desktop relay client transport.
- `packages/desktop/tests/relay-client-transport.test.ts` — client transport behavior against relay-like WebSocket peers.
- `packages/desktop/tests/relay-roundtrip.test.ts` — cross-package `RelayServer` + `RelayClientTransport` proof.
- `README.md` — M2-a development and verification commands.

## Task 1: Shared `join-room` Protocol

- [x] **Step 1: Write failing tests**

Add tests to `shared/tests/signaling.test.ts`:

- accepts `{ v: 1, t: 'join-room', roomId: 'room-1', role: 'agent', clientId: 'agent-1' }`
- accepts Viewer role
- rejects empty `roomId`
- rejects unknown role
- keeps `PROTOCOL_VERSION === 1`

- [x] **Step 2: Run red**

```bash
pnpm --filter @desk/shared test -- tests/signaling.test.ts
```

- [x] **Step 3: Implement schema**

Add a `join-room` branch to `SignalingMessageSchema`:

```typescript
z.object({
  v: VersionSchema,
  t: z.literal('join-room'),
  roomId: z.string().min(1),
  role: z.enum(['agent', 'viewer']),
  clientId: z.string().min(1),
})
```

- [x] **Step 4: Run green**

```bash
pnpm --filter @desk/shared test -- tests/signaling.test.ts
pnpm --filter @desk/shared typecheck
```

## Task 2: Relay Server Package

- [x] **Step 1: Scaffold package**

Create `packages/relay-server` with package scripts:

```json
{
  "typecheck": "tsc --noEmit",
  "lint": "eslint src tests",
  "test": "vitest run"
}
```

Dependencies:

- `@desk/shared`: `workspace:*`
- `@desk/signaling`: `workspace:*`
- `ws`: existing version

Dev dependencies:

- `@types/node`
- `@types/ws`
- `typescript`
- `vitest`

- [x] **Step 2: Write failing server tests**

Create `packages/relay-server/tests/server.test.ts`:

- starts on port `0` and exposes the selected port
- accepts one Agent and one Viewer in the same `roomId`
- forwards non-`join-room` signaling messages from Agent to Viewer and Viewer to Agent
- rejects a second Agent or second Viewer in the same room with `{ t: 'bye', reason: E_PEER_BUSY }`
- removes a socket from the room on close, then allows another socket with the same role to join
- drops invalid JSON/schema without throwing

- [x] **Step 3: Implement `RelayServer`**

`packages/relay-server/src/server.ts` should:

- use `WebSocketServer`
- decode/encode via `@desk/signaling`
- keep `Map<string, { agent?: Peer; viewer?: Peer }>`
- require first valid message from each socket to be `join-room`
- route later messages only to the opposite role in the same room
- emit `closed` cleanup when sockets close
- expose `start()`, `stop()`, and `port`

- [x] **Step 4: Run green**

```bash
pnpm --filter @desk/relay-server test
pnpm --filter @desk/relay-server typecheck
pnpm --filter @desk/relay-server lint
```

## Task 3: Relay Client Transport

- [x] **Step 1: Write failing transport tests**

Create `packages/desktop/tests/relay-client-transport.test.ts`:

- connects to a relay server and sends `join-room` on open
- lets Agent and Viewer clients exchange `ping` / `pong`
- emits `open`, `closed`, and `error`
- `start()` is idempotent while connecting/open
- `stop()` closes cleanly
- logs and drops invalid messages

- [x] **Step 2: Implement `RelayClientTransport`**

Update `RelayOpts`:

```typescript
export type RelayOpts = {
  url: string
  roomId: string
  role: 'agent' | 'viewer'
  clientId: string
  logger?: { warn(message: string): void }
}
```

Behavior:

- `start()` opens `ws` and sends `join-room`
- `send()` forwards existing `SignalingMessage` values after open
- message decode/drop semantics match embedded transports
- stale socket guards match `EmbeddedClientTransport`

- [x] **Step 3: Run green**

```bash
pnpm --filter @desk/desktop test -- tests/relay-client-transport.test.ts
pnpm --filter @desk/desktop typecheck
pnpm --filter @desk/desktop lint
```

## Task 4: Relay Roundtrip Integration

- [x] **Step 1: Add cross-package proof**

Add a test that starts `RelayServer`, connects two `RelayClientTransport` instances in one room, and verifies:

- Viewer sends `pair-request`; Agent receives it
- Agent sends `offer`; Viewer receives it
- Viewer sends `answer`; Agent receives it
- either side sends `ice`; the opposite side receives it
- Viewer sends `bye`; Agent receives it

- [x] **Step 2: Run full verification**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @desk/desktop build
```

## Task 5: Docs

- [x] **Step 1: Update README**

Add M2-a commands:

```bash
pnpm --filter @desk/relay-server test
pnpm --filter @desk/desktop test -- tests/relay-client-transport.test.ts tests/relay-roundtrip.test.ts
```

- [x] **Step 2: Update spec if behavior differs**

Only update `docs/specs/2026-05-17-remote-desktop-design.md` if the implementation needs a concrete M2-a protocol detail not already covered by §18.1.

## Self-Review Checklist

- [x] `PROTOCOL_VERSION` remains `1`.
- [x] `shared/` imports no workspace package.
- [x] `signaling/` imports only `shared/` and has no Node-only runtime dependencies.
- [x] `relay-server/` imports no Electron API.
- [x] Unknown message types are dropped with warning semantics, not thrown through transport callbacks.
- [x] Existing M1 E2E still passes.
