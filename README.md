# desk-controller

LAN-only remote desktop control system built with Electron and WebRTC.

## M1 Milestone

M1 focuses on desktop-to-desktop control on a local network. A Viewer receives the
Agent desktop stream over WebRTC and sends mouse and keyboard commands over data
channels.

See the [M1 design spec](docs/specs/2026-05-17-remote-desktop-design.md) and
[CLAUDE.md](CLAUDE.md).

## Requirements

- Node.js 20.11+
- pnpm 9+
- macOS 12+ or Windows 10+

## Install

```bash
pnpm install
```

## Develop

```bash
pnpm dev:agent
pnpm dev:viewer
```

Agent and Viewer run as independent Electron instances with separate `userData`
directories.

## 30-second quickstart

1. Run `pnpm install`.
2. Terminal A: run `pnpm dev:agent` and note the 6-character pairing code.
3. Terminal B: run `pnpm dev:viewer`, choose the Agent from the discovery list, and enter the code.
4. The Agent screen appears in the Viewer. Mouse and keyboard events are forwarded over WebRTC data channels.

## Verify

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm e2e:m1
pnpm e2e:m1:real
```

M2 relay smoke:

```bash
pnpm --filter @desk/relay-server test -- tests/server.test.ts
pnpm --filter @desk/desktop test -- tests/relay-client-transport.test.ts tests/relay-roundtrip.test.ts
pnpm e2e:m2:mobile
pnpm e2e:m2:native:ios
pnpm e2e:m2:native:android
```

## Manual Test Plan

Use two app instances on the same LAN:

1. Agent window shows a 6-character Base32 code.
2. Viewer lists the Agent under discovered Agents within 5 seconds.
3. Select the Agent, enter the code, and confirm the stream appears within 3 seconds.
4. Move the mouse over the video and confirm the Agent pointer moves.
5. Confirm left click, right click, and scroll wheel work on the Agent.
6. Type letters and Cmd/Ctrl combinations such as Cmd+C and Cmd+Tab in a test field.
7. Disconnect from the Viewer toolbar and confirm the Agent returns to pairing.
8. Disconnect from the Agent side and confirm the Viewer returns to the Agent list.
9. Close the Viewer window normally and confirm the Agent returns to pairing.
10. Enter the wrong code 3 times and confirm 60-second lockout plus code rotation.
11. Start a second Viewer and confirm it is rejected while the first Viewer is active.
12. Hold Shift, close Viewer abruptly, and confirm the Agent does not keep Shift pressed.
13. Briefly interrupt the network and confirm both sides recover or fail cleanly.

Automated E2E coverage:

- `pnpm e2e:m1` covers discovery, pairing, WebRTC offer/answer,
  stream delivery, mouse, keyboard, Viewer disconnect, wrong-code lockout with code
  rotation, second Viewer rejection, and modifier cleanup after abrupt Viewer transport
  loss.
- The test uses real loopback `ws` signaling plus fake WebRTC, discovery, screen capture,
  and native input boundaries so it can run in CI.
- `pnpm e2e:m1:real` uses Playwright to launch real Agent and Viewer Electron
  processes, then verifies macOS display capture, pairing, WebRTC connection, and a
  live remote video track attached in the Viewer. It requires local Screen Recording
  and Accessibility permissions, so treat it as local smoke coverage rather than
  headless CI coverage.
- `pnpm e2e:m2:mobile` starts the real relay server and drives the React
  Native-compatible Viewer session with a fake native WebRTC adapter. This covers the
  mobile relay pairing, offer/answer, ICE, and remote stream handoff without requiring
  an iOS Simulator or Android emulator.

## Known Limitations (M1)

- LAN only. Public relay, NAT traversal, and mobile clients are M2 work.
- One Viewer per Agent.
- IME input is not supported.
- Primary display capture only.
- No clipboard sync, file transfer, or audio return.
- macOS requires Screen Recording and Accessibility permissions.
- System shortcuts such as Cmd+W and Cmd+Q act on the Viewer app, not the Agent.

## References

- [Architecture spec](docs/specs/2026-05-17-remote-desktop-design.md)
- [Implementation plan](docs/plans/2026-05-17-remote-desktop-m1.md)
- [Repository conventions](CLAUDE.md)
