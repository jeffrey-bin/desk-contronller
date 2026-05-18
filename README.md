# desk-controller

基于 Electron 与 WebRTC 的局域网远程桌面控制系统。

[English README](README.en.md)

## M1 里程碑

M1 聚焦局域网内的桌面端到桌面端控制。Viewer 通过 WebRTC 接收 Agent
的桌面视频流，并通过 DataChannel 发送鼠标与键盘指令。

参考 [M1 设计文档](docs/specs/2026-05-17-remote-desktop-design.md) 与
[CLAUDE.md](CLAUDE.md)。

## 环境要求

- Node.js 20.11+
- pnpm 9+
- macOS 12+ 或 Windows 10+
- Xcode 16+，用于 iOS Simulator 构建与已签名 iOS archive
- Android SDK 与 JDK 17，用于 Android release 构建
- GitHub CLI `gh`，用于发布 GitHub Release

## 安装

```bash
pnpm install
```

## 开发运行

```bash
pnpm dev:agent
pnpm dev:viewer
```

Agent 与 Viewer 会作为两个独立 Electron 实例运行，并使用各自独立的
`userData` 目录。

## 30 秒快速开始

1. 运行 `pnpm install`。
2. 终端 A 运行 `pnpm dev:agent`，记下 6 位配对码。
3. 终端 B 运行 `pnpm dev:viewer`，从发现列表选择 Agent，并输入配对码。
4. Viewer 中出现 Agent 屏幕。鼠标与键盘事件会通过 WebRTC DataChannel
   转发到 Agent。

## 打包 Release

构建桌面端双应用、Android APK、iOS Simulator app，并生成本地交付目录：

```bash
pnpm release:build
```

交付目录为 `release/`，包含：

- `DeskController-Agent-mac-*.zip`
- `DeskController-Viewer-mac-*.zip`
- `DeskMobileViewer-Android-release.apk`
- `DeskMobileViewer-iOS-Simulator.zip`
- `README.md` 与 `README.zh-CN.md` 测试说明

在已经配置 Apple 签名的 Mac 上构建 TestFlight/App Store 用 IPA：

```bash
IOS_TEAM_ID=YOUR_TEAM_ID \
IOS_BUNDLE_ID=com.yourcompany.deskcontroller.viewer \
pnpm package:ios:ipa

pnpm release:prepare
```

CI 或干净签名机也可以使用 App Store Connect API 凭据，避免依赖 Xcode
交互式账号：

```bash
IOS_TEAM_ID=YOUR_TEAM_ID \
IOS_BUNDLE_ID=com.yourcompany.deskcontroller.viewer \
ASC_KEY_PATH=/absolute/path/AuthKey_XXXXXXXXXX.p8 \
ASC_KEY_ID=XXXXXXXXXX \
ASC_ISSUER_ID=00000000-0000-0000-0000-000000000000 \
pnpm package:ios:ipa
```

`pnpm package:ios:ipa` 默认使用 `IOS_EXPORT_METHOD=app-store-connect`。
手动签名时可覆盖 `IOS_EXPORT_METHOD`、`IOS_SIGNING_STYLE` 或
`IOS_PROVISIONING_PROFILE_SPECIFIER`。

## 发布 GitHub Release

`release/` 目录不会提交到 Git。大安装包通过 GitHub Release assets 分发：

```bash
pnpm release:build
pnpm release:github v0.1.0 --draft
```

这会创建并推送 Git tag，然后把 `release/` 目录里的安装包和说明文档上传到
GitHub Release。默认建议先发 draft，确认 assets 都正确后再公开给面试官。

常用命令：

```bash
pnpm release:github v0.1.0 --dry-run
pnpm release:github v0.1.0 --publish
pnpm release:github v0.1.0 --draft --prerelease
```

## 验证

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

M2 relay smoke：

```bash
pnpm --filter @desk/relay-server test -- tests/server.test.ts
pnpm --filter @desk/desktop test -- tests/relay-client-transport.test.ts tests/relay-roundtrip.test.ts
pnpm e2e:m2:mobile
pnpm e2e:m2:native:ios
pnpm e2e:m2:native:android
```

## 手动测试清单

在同一局域网内运行两个应用实例：

1. Agent 窗口显示 6 位 Base32 配对码。
2. Viewer 在 5 秒内把 Agent 展示在发现列表中。
3. 选择 Agent，输入配对码，确认 3 秒内出现画面。
4. 在视频区域移动鼠标，确认 Agent 端指针移动。
5. 确认左键、右键、滚轮在 Agent 端生效。
6. 在测试输入框中输入字母，并测试 Cmd/Ctrl 组合键，例如 Cmd+C、Cmd+Tab。
7. 从 Viewer 工具栏断开，确认 Agent 回到 pairing 状态。
8. 从 Agent 侧断开，确认 Viewer 回到 Agent 列表。
9. 正常关闭 Viewer 窗口，确认 Agent 回到 pairing 状态。
10. 连续输入 3 次错误配对码，确认 60 秒锁定并轮换配对码。
11. 启动第二个 Viewer，确认第一个 Viewer 活跃时第二个会被拒绝。
12. 按住 Shift 后突然关闭 Viewer，确认 Agent 不会保持 Shift 按下状态。
13. 短暂中断网络，确认两端能恢复或干净失败。

## 面试官 Release 测试流程

使用 GitHub Release 下载的安装包，或使用本地 `release/` 目录中的文件。

桌面端到桌面端：

1. 解压 `DeskController-Agent-mac-*.zip` 与 `DeskController-Viewer-mac-*.zip`。
2. 打开 Agent。macOS 弹窗时授予 Screen Recording 与 Accessibility 权限；
   如果系统要求重启应用，则重启 Agent。
3. 在同一台 Mac 或同一局域网另一台 Mac 上打开 Viewer。
4. 选择自动发现的 Agent，或手动输入 Agent 窗口显示的 host 与 port。
5. 输入 6 位配对码。
6. 确认 Agent 屏幕出现，鼠标移动、点击、滚轮、键盘输入都能到达 Agent，
   且 Disconnect 后两端回到 idle/pairing。

Android Viewer：

1. 在 BlueStacks 或实体 Android 设备安装
   `DeskMobileViewer-Android-release.apk`。
2. 在同一局域网启动桌面 Agent。
3. 打开 Android Viewer，输入 Agent host、port 与配对码。
4. WebRTC stream 连接后，确认 Agent 屏幕撑满手机视口。

iOS Viewer，Simulator 路径：

1. 解压 `DeskMobileViewer-iOS-Simulator.zip`。
2. 从 Xcode 启动一个 iOS Simulator。
3. 在解压目录运行 `xcrun simctl install booted DeskMobileViewer.app`。
4. 启动桌面 Agent，打开 iOS Viewer，输入 host、port 与配对码，确认全屏串流。

iOS Viewer，TestFlight 路径：

1. 在已配置 Apple Developer 签名的机器上运行 `pnpm package:ios:ipa` 生成
   `DeskMobileViewer-iOS-AppStore.ipa`。
2. 上传 IPA 到 App Store Connect 或 Transporter。
3. 从 TestFlight 安装，连接桌面 Agent，并执行与 Simulator 路径相同的全屏串流检查。

自动化 E2E 覆盖：

- `pnpm e2e:m1` 覆盖发现、配对、WebRTC offer/answer、视频流交付、鼠标、
  键盘、Viewer 断开、错误码锁定与配对码轮换、第二 Viewer 拒绝，以及 Viewer
  异常断开后的 modifier 清理。
- 该测试使用真实 loopback `ws` 信令，并用 fake WebRTC、发现、屏幕捕获和原生输入边界，
  因此可以在 CI 中运行。
- `pnpm e2e:m1:real` 使用 Playwright 启动真实 Agent 与 Viewer Electron 进程，
  验证 macOS 屏幕捕获、配对、WebRTC 连接，以及 Viewer 中挂载的实时远端视频轨道。
  它依赖本地 Screen Recording 与 Accessibility 权限，因此更适合作为本地 smoke
  coverage，而不是 headless CI coverage。
- `pnpm e2e:m2:mobile` 启动真实 relay server，并通过 fake native WebRTC adapter
  驱动 React Native-compatible Viewer 会话。它覆盖移动端 relay 配对、offer/answer、
  ICE 与远端 stream handoff，不依赖 iOS Simulator 或 Android emulator。

## 已知限制，M1

- 仅支持局域网。公网 relay、NAT traversal、移动客户端属于 M2。
- 单个 Agent 同时只支持一个 Viewer。
- 不支持 IME 输入。
- 只捕获主屏幕。
- 不支持剪贴板同步、文件传输、音频回传。
- macOS 需要 Screen Recording 与 Accessibility 权限。
- Cmd+W、Cmd+Q 等系统快捷键作用于 Viewer 应用本身，不会发送给 Agent。

## 参考

- [架构设计文档](docs/specs/2026-05-17-remote-desktop-design.md)
- [实现计划](docs/plans/2026-05-17-remote-desktop-m1.md)
- [仓库规范](CLAUDE.md)
