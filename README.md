# desk-controller

LAN-only remote desktop control system built with Electron and WebRTC.

[中文对照](README.zh-CN.md)

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
- Xcode 16+ for iOS Simulator builds and signed iOS archives
- Android SDK plus JDK 17 for Android release builds

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

## Package Release Builds

Build the desktop apps, Android APK, iOS Simulator app, and a local release
handoff directory:

```bash
pnpm release:build
```

The handoff directory is `release/` and contains:

- `DeskController-Agent-mac-*.zip`
- `DeskController-Viewer-mac-*.zip`
- `DeskMobileViewer-Android-release.apk`
- `DeskMobileViewer-iOS-Simulator.zip`
- `README.md` with the tester-facing install flow

Build a TestFlight/App Store IPA on a Mac with Apple signing configured:

```bash
IOS_TEAM_ID=YOUR_TEAM_ID \
IOS_BUNDLE_ID=com.yourcompany.deskcontroller.viewer \
pnpm package:ios:ipa

pnpm release:prepare
```

For CI or a clean signing machine, App Store Connect API credentials can be used
instead of an interactive Xcode account:

```bash
IOS_TEAM_ID=YOUR_TEAM_ID \
IOS_BUNDLE_ID=com.yourcompany.deskcontroller.viewer \
ASC_KEY_PATH=/absolute/path/AuthKey_XXXXXXXXXX.p8 \
ASC_KEY_ID=XXXXXXXXXX \
ASC_ISSUER_ID=00000000-0000-0000-0000-000000000000 \
pnpm package:ios:ipa
```

`pnpm package:ios:ipa` exports with `IOS_EXPORT_METHOD=app-store-connect` by
default. Override `IOS_EXPORT_METHOD`, `IOS_SIGNING_STYLE`, or
`IOS_PROVISIONING_PROFILE_SPECIFIER` when using manual signing.

## Verify

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm e2e:m1
pnpm e2e:m1:real
pnpm package:desktop
pnpm package:android
pnpm package:ios:sim
pnpm release:prepare
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

## Interviewer Release Test Plan

Use the files in `release/`.

Desktop-to-desktop:

1. Unzip `DeskController-Agent-mac-*.zip` and `DeskController-Viewer-mac-*.zip`.
2. Open Agent. Grant macOS Screen Recording and Accessibility permissions when
   prompted, then restart Agent if macOS asks for a restart.
3. Open Viewer on the same Mac or another Mac on the same LAN.
4. Select the discovered Agent, or manually enter the Agent host and port shown
   in the Agent window.
5. Enter the 6-character pairing code.
6. Confirm the Agent screen appears, mouse move/click/scroll work, keyboard
   input reaches the Agent, and Disconnect returns both sides to idle/pairing.

Android Viewer:

1. Install `DeskMobileViewer-Android-release.apk` on BlueStacks or a physical
   Android device.
2. Start the desktop Agent on the same LAN.
3. Open the Android Viewer and enter the Agent host, port, and pairing code.
4. Confirm the Agent screen expands to the phone viewport after the WebRTC stream
   connects.

iOS Viewer through Simulator:

1. Unzip `DeskMobileViewer-iOS-Simulator.zip`.
2. Boot an iOS Simulator from Xcode.
3. Install with `xcrun simctl install booted DeskMobileViewer.app` from the
   unzipped directory.
4. Start the desktop Agent, open the iOS Viewer, enter host, port, and pairing
   code, then confirm full-screen streaming.

iOS Viewer through TestFlight:

1. Generate `DeskMobileViewer-iOS-AppStore.ipa` with `pnpm package:ios:ipa` on a
   signed Apple Developer machine.
2. Upload the IPA to App Store Connect or Transporter.
3. Install from TestFlight, connect to the desktop Agent, and run the same
   full-screen streaming checks as the Simulator path.

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
