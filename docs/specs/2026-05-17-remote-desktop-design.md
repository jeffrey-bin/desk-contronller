# 远程桌面控制系统设计文档（MVP / M1）

> 版本: v1 · 日期: 2026-05-17 · 状态: Draft for review

---

## 1. 目标与非目标

### 1.1 项目目标

构建一个跨平台的远程桌面控制系统，允许一台「控制端（Viewer）」通过网络实时观看并操作另一台「被控端（Agent）」的桌面。核心诉求：

1. **架构合理**：模块边界清晰、协议可演进、关键抽象到位
2. **系统稳定**：边界条件覆盖完整、错误处理统一、状态机可证明
3. **MVP 可演示**：在局域网内端到端跑通视频流 + 鼠标键盘控制

### 1.2 M1 范围（本设计文档覆盖）

| 维度 | M1 范围 |
|---|---|
| 角色 | Desktop Viewer + Desktop Agent + 内嵌 Signaling |
| 网络 | 局域网（LAN）|
| 平台 | macOS + Windows（Agent 与 Viewer 同构）|
| 视频 | 单显示器，主屏，H.264 优先，自适应码率 |
| 控制 | 鼠标（移动 / 点击 / 滚轮）+ 键盘（含修饰键） |
| 鉴权 | 6 位 Base32 配对码 + TTL + 重试锁定 |
| UX | Agent 主窗口 + 悬浮状态条 + 一键断开；Viewer 列表 + 画布 + 实时统计 |
| 发现 | mDNS 自动发现 + 手动 IP:Port 兜底 |
| 观测 | 实时 WebRTC 统计 UI、`electron-log` 文件日志 |

### 1.3 非目标（显式不做）

下列功能**故意不在 MVP 范围**，写明以避免歧义：

- 多显示器切换 / 选择
- 剪贴板双向同步
- 文件传输 / 拖放
- 音频回传
- IME（中文输入法）支持
- 屏幕录像本地保存
- 跨公网连接（M2）
- 移动端 Viewer（M2）
- Linux 被控端
- 多 Viewer 同时控制（同时只接受 1 个连接，第二个直接拒绝）
- Viewer → Agent 反向触摸控制
- Wake-on-LAN 远程开机
- 系统快捷键拦截转发（按 ESC 退出全屏，全局快捷键不转发）
- 自动更新与打包分发（先以源码 dev 模式跑通，打包后补）

### 1.4 演进路径

| 里程碑 | 增量 |
|---|---|
| M1（本文档） | LAN + 桌面双端 + 核心通路 |
| M2-a | 公网信令中继（rendezvous）+ TURN 集成 |
| M2-b | React Native 移动端 Viewer（含触摸映射） |
| M3+ | 多屏、剪贴板、文件传输等增值能力 |

---

## 2. 整体架构

### 2.1 角色

- **Agent（被控端）**：Electron 应用。采集本机屏幕、接收控制指令、用 `nut-js` 注入键鼠事件。内嵌信令服务器与 mDNS 广播。
- **Viewer（控制端）**：Electron 应用。发现 Agent、输入配对码、接收视频流、采集本地输入并下发。
- **Signaling（信令）**：M1 阶段是 Agent main process 内嵌的 WebSocket Server，承载 SDP / ICE / 配对消息。M2 会演化为独立公网服务。

### 2.2 拓扑图

```
┌──────────────────────────────┐                    ┌──────────────────────────────┐
│            AGENT             │                    │            VIEWER            │
│                              │                    │                              │
│  ┌────────────────────────┐  │                    │  ┌────────────────────────┐  │
│  │  Main Process          │  │                    │  │  Main Process          │  │
│  │   - ws Signaling Server│◄─┼────WebSocket───────┼──┤   - ws Signaling Client│  │
│  │   - mDNS Broadcaster   │  │ (SDP / ICE / Pair) │  │   - mDNS Browser       │  │
│  │   - nut-js Input       │◄┐│                    │  │                        │  │
│  └────────┬───────────────┘ ││                    │  └────────┬───────────────┘  │
│           │ IPC             ││                    │           │ IPC              │
│  ┌────────▼───────────────┐ ││                    │  ┌────────▼───────────────┐  │
│  │  Renderer              │ ││                    │  │  Renderer              │  │
│  │   - desktopCapturer    │ ││                    │  │   - <video> + Canvas   │  │
│  │   - RTCPeerConnection  ├─┼┼──── WebRTC ────────┼──┤   - RTCPeerConnection  │  │
│  │     · video track ─────┼─┼┼─── MediaStream ───►│  │     · video track      │  │
│  │     · DC: mouse ◄──────┼─┘│                    │  │     · DC: mouse        │  │
│  │     · DC: keyboard ◄───┼──┼──── DataChannel ───┼──┤     · DC: keyboard     │  │
│  └────────────────────────┘  │                    │  └────────────────────────┘  │
│                              │                    │                              │
│  Tray + Main Window + HUD    │                    │  Discovery + Pairing + View  │
└──────────────────────────────┘                    └──────────────────────────────┘
```

### 2.3 关键技术决策一览

| 决策 | 选择 | 理由 |
|---|---|---|
| 视频传输 | WebRTC P2P + DTLS-SRTP | 标准、低延迟、自带加密 |
| 信令传输 | WebSocket（embedded） | Electron main 起 ws server 最简单；M2 切到公网 server 协议不变 |
| 信令位置（M1） | Agent main process | Viewer 既有桌面又有 RN（M2），RN 起不了 server，因此固定 Agent 端 |
| 控制通道 | 双 DataChannel | mousemove 走 unreliable（最新覆盖旧），其他走 reliable ordered |
| 键鼠注入 | `@nut-tree-fork/nut-js` | 跨平台 native，PoC 已验证 macOS 可控其他 App |
| 视频编码 | SDP munging 强制 H.264 优先 | 屏幕文字锐利；macOS/Windows 都有硬解 |
| 视频参数 | maxBitrate 8 Mbps · degradationPreference=maintain-resolution · contentHint=detail | 屏幕共享场景标准调优 |
| 设备发现 | mDNS（bonjour-service）+ 手动输入兜底 | mDNS 在受限网络易失效，必须有兜底 |
| 鉴权 | 6 位 Base32 配对码 + 5min TTL + 3 次锁定 60s | 防暴力 + 防误连 |
| 坐标系 | 归一化（[0,1]）相对于视频内容区域（非 DOM） | 与视口/缩放/letterbox 解耦 |
| 状态管理（前端） | Zustand | 轻量、无 boilerplate |
| 构建 | electron-vite + electron-builder | 现代 + HMR |
| Monorepo | pnpm workspaces | 轻量、缓存好 |

---

## 3. 技术栈

| 类别 | 选择 | 备注 |
|---|---|---|
| 语言 | TypeScript 5.x（strict） | 全栈统一 |
| 运行时 | Electron 30+ | Chromium 内置 H.264 |
| 包管理 | pnpm 9+ | workspaces |
| 构建（Electron） | electron-vite | main / preload / renderer 一站式 |
| 打包（M1 后） | electron-builder | mac dmg + win nsis |
| 前端框架 | React 18 + TypeScript | |
| 状态管理 | Zustand | |
| UI 组件 | Tailwind CSS + shadcn/ui | 默认主题足够 |
| 信令传输 | `ws`（main） + 浏览器 WebSocket（renderer） | |
| 设备发现 | `bonjour-service` | mDNS / DNS-SD |
| 输入注入 | `@nut-tree-fork/nut-js` | native，需 electron-rebuild |
| 协议校验 | `zod` | 信令与控制消息 schema |
| 日志 | `electron-log` | main + renderer 统一 |
| 持久化 | `electron-store` | 用户配置 |
| 测试 | Vitest + @testing-library/react | |
| Lint / Format | ESLint + Prettier + husky + lint-staged | |
| CI | GitHub Actions（lint + typecheck + unit test） | 不做打包 CI |

---

## 4. Monorepo 结构

```
remote-desktop/
├── packages/
│   ├── desktop/              # Electron 应用（Agent + Viewer 双模式）
│   │   ├── src/
│   │   │   ├── main/         # main process
│   │   │   │   ├── agent/    # Agent 专属（信令 server、nut-js、mDNS 广播）
│   │   │   │   ├── viewer/   # Viewer 专属（信令 client、mDNS 浏览）
│   │   │   │   ├── ipc/      # IPC 通道定义
│   │   │   │   └── index.ts
│   │   │   ├── preload/      # contextBridge 白名单
│   │   │   ├── renderer/     # React 应用
│   │   │   │   ├── agent/    # Agent UI（配对码、悬浮窗、状态）
│   │   │   │   ├── viewer/   # Viewer UI（发现列表、画布、统计）
│   │   │   │   ├── shared/   # 共享组件、hooks
│   │   │   │   └── main.tsx
│   │   │   └── shared/       # main/renderer 共用的纯逻辑（如坐标转换）
│   │   ├── electron.vite.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── signaling/            # 信令协议 + Transport 抽象与实现
│   │   ├── src/
│   │   │   ├── protocol/     # 消息类型 + zod schema
│   │   │   ├── transport/    # SignalingTransport 接口
│   │   │   │   ├── embedded-server.ts  # M1：Agent 内嵌
│   │   │   │   ├── embedded-client.ts  # M1：Viewer 连内嵌
│   │   │   │   └── relay-client.ts     # M2：公网中继客户端（接口预留）
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── relay-server/         # M2 预留，公网信令中继（暂为空骨架）
│   └── mobile-viewer/        # M2 预留，React Native（暂为空骨架）
│
├── shared/                   # 跨包共享（类型 / 常量 / 纯函数）
│   ├── src/
│   │   ├── protocol/         # 控制协议（DataChannel 消息）
│   │   ├── constants.ts
│   │   ├── coords.ts         # 坐标转换、letterbox 计算
│   │   ├── pairing.ts        # 配对码生成与校验
│   │   └── index.ts
│   └── package.json
│
├── docs/
│   └── specs/
│       └── 2026-05-17-remote-desktop-design.md  # 本文档
│
├── .github/workflows/
│   └── ci.yml                # lint + typecheck + test
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── CLAUDE.md
└── README.md
```

**包依赖规则**：

- `shared/` 零运行时依赖，不引用任何其他包
- `signaling/` 仅依赖 `shared/`，**不引用 Electron API**（确保 M2 relay-server 能在 Node 环境下复用）
- `desktop/` 依赖 `shared/` + `signaling/` + Electron 生态
- 包之间通过 `workspace:*` 引用

---

## 5. 进程与模块边界

### 5.0 双模式运行（Agent / Viewer）

`packages/desktop` 是单个 Electron 应用包，但运行时只承担其中一种角色——同一进程同时跑 Agent 与 Viewer 会带来权限耦合（不必要的屏幕录制请求）和 UI 错乱。模式选择策略：

- **开发**：通过环境变量决定。`pnpm dev:agent` / `pnpm dev:viewer` 启动两个独立的 Electron 实例（不同 userData 目录，避免 `requestSingleInstanceLock` 冲突）。
- **生产打包**：单一安装包，首次启动展示「我要被控制 / 我要控制别人」二选一欢迎页，记忆到 `electron-store`，下次直接进入对应主界面。设置面板可切换。

main 进程根据当前模式只加载对应子模块（`main/agent/*` 或 `main/viewer/*`），renderer 路由到对应 UI。

### 5.1 Electron 内部进程分工

| 模块 | 进程 | 不可改变原因 |
|---|---|---|
| `desktopCapturer` + `MediaStream` | renderer | API 只在 renderer 暴露 |
| `RTCPeerConnection` / `DataChannel` | renderer | 必须与 MediaStream 同进程 |
| `ws` Server（Agent 信令） | main | renderer 不能监听端口 |
| `ws` Client（Viewer 信令） | main | 与发现/IPC 协同；renderer 也能跑但收敛在 main 更清晰 |
| `@nut-tree-fork/nut-js` | main | native module，无法在 sandbox renderer 加载 |
| mDNS 广播/浏览 | main | UDP 多播 |
| 配对码生命周期 | main | 状态权威源；renderer 仅显示 |

### 5.2 Electron 安全基线

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`（renderer）
- 所有 IPC 通过 `preload` + `contextBridge.exposeInMainWorld` 显式白名单暴露
- preload 不直接导入 native module

### 5.3 信令传输抽象（SignalingTransport）

为兼容 M2 的公网中继，从 day 1 就抽象信令传输：

```typescript
// packages/signaling/src/transport/index.ts
export interface SignalingTransport {
  start(): Promise<void>
  stop(): Promise<void>
  send(msg: SignalingMessage): void
  onMessage(handler: (msg: SignalingMessage) => void): () => void
  onConnectionState(handler: (state: 'open' | 'closed' | 'error') => void): () => void
}

// 实现:
// - EmbeddedServerTransport：Agent 端，ws.Server，监听端口
// - EmbeddedClientTransport：Viewer 端，ws Client，连 Agent IP:Port
// - RelayClientTransport：M2 预留，Agent/Viewer 都作为 client 连公网 rendezvous
```

上层（连接管理、配对、PC 协商）只依赖接口，切换实现不需要改业务代码。

---

## 6. 数据流

### 6.1 视频流（Agent → Viewer）

```
Agent.renderer.desktopCapturer.getUserMedia()
   → MediaStream (1 video track)
   → pc.addTrack(track, stream)
   → SDP munging（H.264 优先）
   → setLocalDescription(offer)  ※ 见 6.4 序列
   → 通过 IPC 把 SDP 推给 main
   → main 通过 ws 发给 Viewer
   →
   → Viewer.main 收到 SDP，IPC 推给 renderer
   → renderer.pc.setRemoteDescription
   → ontrack → 拿到 MediaStream
   → <video>.srcObject = stream
   → 自适应播放
```

视频参数（在 `RTCRtpSender.setParameters` 与 `MediaStreamTrack.contentHint` 上配置）：

| 参数 | 值 |
|---|---|
| `encodings[0].maxBitrate` | `8_000_000` |
| `encodings[0].maxFramerate` | `60` |
| `degradationPreference` | `maintain-resolution` |
| `contentHint`（on track） | `detail` |

### 6.2 控制流（Viewer → Agent）

```
Viewer.renderer 收集 mouse/keyboard 事件
   → 坐标转换（DOM → 视频归一化）
   → mousemove 节流到 120Hz
   → 按类型分发到对应 DataChannel
       mouse channel  (ordered=false, maxRetransmits=0)
       keyboard channel (ordered=true, reliable)
   →
   → Agent.renderer 通过 DataChannel.onmessage 收到
   → zod 校验
   → IPC 推给 main
   → main 调 nut-js 执行
       mouse.setPosition / mouse.click / mouse.scrollDown ...
       keyboard.pressKey / releaseKey
```

### 6.3 信令流（双向）

仅承载连接建立期与运行期的元消息，不传业务数据：

- `hello` / `pair-request` / `pair-result`
- `offer` / `answer` / `ice`
- `bye` / `ping` / `pong`

详见 §7.1。

### 6.4 完整连接建立序列

**协商方向约定：Agent 是 offerer，Viewer 是 answerer**。理由：Agent 同时持有视频 track 与两条 DC 的语义需求，由 Agent 一次性把所有 m-line 装进 offer，避免 Viewer 先 offer、Agent 再 addTrack 触发的 renegotiation 往返。

```
Agent 启动
  └─► main: 启动 ws server (随机端口) + mDNS 广播 + 生成配对码
  └─► renderer: getUserMedia 拿到 video track（预备）
  └─► UI 显示配对码与状态「等待连接」

Viewer 启动
  └─► main: 启动 mDNS 浏览
  └─► UI 显示发现列表
  └─► 用户选择 Agent + 输入配对码
  └─► main: 建立 ws 连接到 Agent
  └─► 发送 hello
  └─► 发送 pair-request { code }
  └─► Agent 校验:
        失败 → pair-result {ok:false, reason}, attempts++, 触发锁定
        成功 → pair-result {ok:true}，进入 connecting 状态，并立刻启动协商

Agent 进入 connecting（自身触发，无需等 Viewer 再发消息）
  └─► renderer: 创建 PC
  └─►          pc.addTrack(videoTrack, stream)
  └─►          pc.createDataChannel('mouse',    { ordered: false, maxRetransmits: 0 })
  └─►          pc.createDataChannel('keyboard', { ordered: true })
  └─►          pc.createOffer → SDP munging (H.264 优先) → setLocalDescription
  └─►          通过 IPC + ws 把 offer 发给 Viewer
  └─►          ICE candidate trickle 持续发送

Viewer 收到 offer
  └─► renderer: 创建 PC
  └─►          pc.ontrack 注册 → 收到视频时绑定到 <video>
  └─►          pc.ondatachannel 注册 → 拿到 mouse/keyboard 两条 DC 的本地引用
  └─►          pc.setRemoteDescription(offer)
  └─►          pc.createAnswer → setLocalDescription
  └─►          通过 IPC + ws 把 answer 发回 Agent
  └─►          ICE candidate trickle 持续发送

双方 setRemoteDescription 完成后
  └─► 应用 RTCRtpSender 参数（maxBitrate / maxFramerate / degradationPreference）
  └─► videoTrack.contentHint = 'detail'

PeerConnection 进入 connected
  └─► Agent 切到 active 状态，UI 显示「正在被控制」悬浮窗
  └─► Viewer 显示视频，启动 stats 轮询，开始转发输入

任一端断开
  └─► 发起方发送 bye + Viewer 额外发 release-all-keys
  └─► 双方 close DC + PC
  └─► Agent 兜底释放所有按键
  └─► Agent 回到 pairing 状态，必要时轮换新码
```

---

## 7. 协议定义

### 7.1 信令协议（WebSocket）

所有消息 JSON，必含 `v` 与 `t`。

```typescript
type SignalingMessage =
  | { v: 1; t: 'hello'; role: 'agent' | 'viewer'; clientId: string }
  | { v: 1; t: 'pair-request'; code: string }
  | { v: 1; t: 'pair-result'; ok: boolean; reason?: ErrorCode }
  | { v: 1; t: 'offer'; sdp: string }
  | { v: 1; t: 'answer'; sdp: string }
  | { v: 1; t: 'ice'; candidate: RTCIceCandidateInit }
  | { v: 1; t: 'bye'; reason?: string }
  | { v: 1; t: 'ping' }
  | { v: 1; t: 'pong' }
```

**方向约定**：

| 消息 | Viewer → Agent | Agent → Viewer |
|---|---|---|
| `hello` | ✓ | ✓（连接建立时各自发） |
| `pair-request` | ✓ | |
| `pair-result` | | ✓ |
| `offer` | | ✓ |
| `answer` | ✓ | |
| `ice` | ✓ | ✓ |
| `bye` | ✓ | ✓ |
| `ping`/`pong` | ✓ | ✓ |

### 7.2 控制协议（DataChannel）

字段名缩短，鼠标事件高频，每字节都算。两条独立通道：

**mouse channel**（`ordered=false, maxRetransmits=0`）

```typescript
type MouseMsg =
  | { t: 'mm'; x: number; y: number }                          // move
  | { t: 'md'; x: number; y: number; b: 0 | 1 | 2 }            // down (0=左, 1=中, 2=右)
  | { t: 'mu'; x: number; y: number; b: 0 | 1 | 2 }            // up
  | { t: 'mw'; x: number; y: number; dx: number; dy: number }  // wheel（单位：行）
```

**keyboard channel**（`ordered=true, reliable`）

```typescript
type KeyMsg =
  | { t: 'kd'; code: string; mods: number }     // KeyboardEvent.code
  | { t: 'ku'; code: string; mods: number }
  | { t: 'sync'; mods: number; keys: string[] } // 1s 一次的兜底
  | { t: 'rk' }                                  // release all
```

`mods` 位掩码：`Shift=1, Ctrl=2, Alt=4, Meta=8`。

**坐标 `x, y`**：[0, 1] 归一化，相对**视频帧内容区域**（详见 §9.2）。

### 7.3 IPC 协议（Electron 内）

```typescript
// main → renderer (webContents.send)
'signaling:in'      payload: SignalingMessage
'session:state'     payload: SessionState
'discovery:found'   payload: AgentInfo[]              // 仅 Viewer

// renderer → main (ipcRenderer.invoke / send)
'signaling:out'     payload: SignalingMessage
'input:event'       payload: MouseMsg | KeyMsg        // 仅 Agent
'connection:start'  payload: { agentHost: string; port: number; code: string }  // 仅 Viewer
'session:end'       payload: { reason?: string }
'permission:check'  payload: void → { screen: boolean; a11y: boolean }
```

### 7.4 错误码

```typescript
type ErrorCode =
  | 'E_PAIR_INVALID_CODE'
  | 'E_PAIR_EXPIRED'
  | 'E_PAIR_TOO_MANY_ATTEMPTS'
  | 'E_PEER_BUSY'
  | 'E_VERSION_MISMATCH'
  | 'E_PERMISSION_SCREEN'
  | 'E_PERMISSION_A11Y'
  | 'E_ICE_FAILED'
  | 'E_TRANSPORT_TIMEOUT'
```

### 7.5 协议版本演进规则

- 所有消息带 `v` 字段，M1 固定为 `1`
- 收到未知 `t` 类型 → 丢弃 + warning 日志，**不 crash**
- `hello` 阶段校验 `v` 不一致 → 返回 `E_VERSION_MISMATCH` 并断开
- 新增字段使用 optional，老端忽略
- 破坏性变更必须升 `v`

---

## 8. 状态机

### 8.1 Agent 会话状态机

Agent 启动后无 `idle` 中间态——默认即在 `pairing` 等待连接。

```
            ┌────────────────────────────────────────────┐
            │                                            │
启动 ──► pairing ───► connecting ───► active ────────────┤
            ▲ │           │ ICE/timeout    │ peer bye    │
            │ │           │                │ user stop   │
            │ │           └────────────────┤             │
            │ │ TTL 到期，轮换 code         │             │
            │ └─────────────────────────────┘             │
            │                                            │
            └─────────── disconnecting ◄─────────────────┘
                          (释放按键、关 PC)
```

```typescript
type SessionState =
  | { phase: 'pairing'; code: string; expiresAt: number; attempts: number }
  | { phase: 'connecting'; viewerId: string }
  | { phase: 'active'; viewerId: string; since: number }
  | { phase: 'disconnecting'; reason: string }
```

**迁移触发**：

| from | to | 触发 |
|---|---|---|
| `pairing` | `pairing` | code TTL 到期，重新生成 |
| `pairing` | `connecting` | 收到正确 `pair-request` → 回 `pair-result(ok)` → 自身触发 createOffer |
| `pairing` | `pairing` | 错误 `pair-request`：attempts++，到达上限锁 60s |
| `connecting` | `active` | `pc.connectionState === 'connected'` |
| `connecting` | `disconnecting` | ICE failed / timeout |
| `active` | `disconnecting` | 收到 `bye` / 用户点断开 / keepalive 超时 |
| `disconnecting` | `pairing` | 清理完成（释放按键 + 关 PC） |

### 8.2 Viewer 连接状态机

```
启动 ──► idle ──► discovering ──► (用户选 agent)
                                       │
                                       ▼
                                connecting-signaling
                                       │ ws open
                                       ▼
                                pairing ──fail── (输错重试 / 找别的)
                                       │ ok
                                       ▼
                                negotiating (offer/answer/ice)
                                       │ pc connected
                                       ▼
                                streaming ──► (用户断开 / 失败) ──► idle
```

### 8.3 PeerConnection 状态映射

监听 `pc.connectionState`：

| PC 状态 | 处理 |
|---|---|
| `new` / `connecting` | 等待，UI 显示「连接中」 |
| `connected` | 切到 active/streaming |
| `disconnected` | 5s 内可能自动恢复，不主动关闭；UI 提示「连接不稳定」 |
| `failed` | 触发清理路径 |
| `closed` | 清理完成 |

---

## 9. 关键算法与处理逻辑

### 9.1 坐标转换（Viewer → Agent）

**协议层传输的是 `[0,1]` 归一化坐标**，相对于视频帧内容区域。

**Viewer 端**（事件 → 归一化）：

```typescript
function eventToNormalized(
  e: MouseEvent,
  videoEl: HTMLVideoElement,
): { x: number; y: number } {
  const { videoWidth, videoHeight } = videoEl
  if (!videoWidth || !videoHeight) return { x: 0, y: 0 }

  const rect = videoEl.getBoundingClientRect()
  const { x, y, w, h } = computeContentRect(
    rect.width, rect.height,
    videoWidth, videoHeight,
  )

  const px = e.clientX - rect.left - x
  const py = e.clientY - rect.top  - y
  return {
    x: clamp(px / w, 0, 1),
    y: clamp(py / h, 0, 1),
  }
}
```

**Agent 端**（归一化 → 屏幕像素）：

```typescript
function normalizedToScreen(
  n: { x: number; y: number },
  display: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: Math.round(n.x * display.width),
    y: Math.round(n.y * display.height),
  }
}
```

`display.width/height` 取 `screen.getPrimaryDisplay().size`（logical pixel，nut-js 也用 logical pixel，不要传 physical）。

### 9.2 视频帧 fit 与 letterbox 计算

`<video>` 用 `object-fit: contain`，需要主动计算内容区域：

```typescript
// shared/src/coords.ts
export function computeContentRect(
  domW: number, domH: number,
  videoW: number, videoH: number,
): { x: number; y: number; w: number; h: number } {
  const domRatio = domW / domH
  const vidRatio = videoW / videoH
  if (vidRatio > domRatio) {
    // 视频更宽 → 上下黑边
    const h = domW / vidRatio
    return { x: 0, y: (domH - h) / 2, w: domW, h }
  } else {
    // 视频更高 → 左右黑边
    const w = domH * vidRatio
    return { x: (domW - w) / 2, y: 0, w, h: domH }
  }
}
```

**这是 MVP 最容易出 bug 的地方，必须有单元测试覆盖**（横竖屏、相等比例、极端比例）。

### 9.3 SDP munging（codec preference + 参数调优）

```typescript
function preferH264(sdp: string): string {
  // 解析 m=video 行，找到 H264 的 payload type，重排到最前
  // 使用成熟实现：sdp-transform 库
}

// 应用：
const offer = await pc.createOffer()
offer.sdp = preferH264(offer.sdp)
await pc.setLocalDescription(offer)

// RTP sender 参数（在 ontrack 之后或 addTrack 之后）：
const sender = pc.getSenders().find(s => s.track?.kind === 'video')
const params = sender.getParameters()
params.encodings[0].maxBitrate = 8_000_000
params.encodings[0].maxFramerate = 60
params.degradationPreference = 'maintain-resolution'
await sender.setParameters(params)

// 内容提示（提示编码器优化文字细节）：
videoTrack.contentHint = 'detail'
```

### 9.4 Mousemove 节流

```typescript
// viewer renderer，120Hz ≈ 8ms
function createMouseMoveThrottler(send: (msg: MouseMsg) => void) {
  let pending: { x: number; y: number } | null = null
  let raf = 0
  let lastSent = 0

  return (x: number, y: number) => {
    pending = { x, y }
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      const now = performance.now()
      if (now - lastSent < 8 || !pending) return
      lastSent = now
      send({ t: 'mm', x: pending.x, y: pending.y })
      pending = null
    })
  }
}
```

**DataChannel buffer 满兜底**：发送前检查 `dc.bufferedAmount > 64KB` 直接丢弃（unreliable channel 允许）。

### 9.5 配对码生成与校验

```typescript
// shared/src/pairing.ts
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  // 去掉 I L O 0 1
const LENGTH = 6

export function generatePairCode(): string {
  const bytes = crypto.randomBytes(LENGTH)
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

// constant-time 比较，防 timing attack
export function verifyPairCode(input: string, expected: string): boolean {
  if (input.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < input.length; i++) {
    diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}
```

**生命周期**：

- Agent 启动 → 生成首个 code，TTL 5min
- 进入 `connecting` 时不轮换（避免 viewer 半途重输）
- 进入 `active` 时不显示（已被控制）
- 回到 `pairing` 时若旧码已到期则生成新码，否则继续用旧码到期
- 错误尝试达 3 次：当前 code 立即失效 + 60s 内拒绝该 viewer 的所有请求 + 立刻生成新 code

### 9.6 修饰键状态同步

防范 keyup 丢失导致「按住 Shift 不放」：

- Viewer 每 1s 发一次 `sync` 消息，携带当前按下的所有 keys + mods
- Agent 收到 `sync`，diff 出本地认为按下但 viewer 没列出的 keys，主动 release
- Viewer 失去窗口焦点（`blur`）→ 立即发 `rk`（release-all）
- Viewer 关闭前 → 发 `rk`
- Agent 收到 `bye` 或 keepalive 超时 → 本地 release 所有按键

---

## 10. 边界条件与错误处理

| 类别 | 场景 | 处理 |
|---|---|---|
| 网络 | ws 信令断 PC 还活着 | 不重建 PC；允许重连信令；UI 提示「信令断开但视频正常」 |
| 网络 | ICE 收集 10s 超时 | 报错 `E_ICE_FAILED`，UI 提示，回到 pairing |
| 网络 | keepalive 3s/10s | 超时视为断开 |
| 网络 | 第二个 viewer 尝试连接 | 立即回 `E_PEER_BUSY` 并断开 ws |
| 鉴权 | 错误 pair code | attempts++，达 3 拒绝 60s |
| 鉴权 | code 过期 | 返回 `E_PAIR_EXPIRED`，UI 提示用户重新查看新码 |
| 输入 | 归一化坐标越界 | Agent 端 `clamp(0, 1)`，不报错 |
| 输入 | viewer 断开时按键残留 | 发 `rk` + Agent 兜底释放 |
| 输入 | IME 输入 | Viewer 端丢弃 composition 事件，不发送 |
| 输入 | 滚轮 delta 单位 | Viewer 按平台归一化为「行数」 |
| 视频 | Agent 切换分辨率 | MediaStream 自动 restart；Viewer 端 video element 重渲染 |
| 视频 | Agent 锁屏 / 屏保 | 视频可能冻结；Viewer 端 5s 无新帧提示 |
| 视频 | 屏幕录制权限未授权 | Agent 启动检测，未授权不进 pairing，UI 引导授权 |
| 视频 | 辅助功能权限未授权 | 同上，单独检测 |
| 协议 | 未知消息 type | 丢弃 + warning，不 crash |
| 协议 | 版本不匹配 | hello 阶段拒绝 |
| 进程 | Agent 单实例锁 | `app.requestSingleInstanceLock`，第二实例退出并把第一实例窗口拉前 |
| 进程 | 退出清理 | `before-quit`：广播 bye → 关 PC/DC → 关 ws server → 释放 capturer；2s 超时强退 |
| UI | Viewer 失去焦点 | 发 `rk`，停止转发输入 |
| UI | Viewer 全屏退出 | 按 ESC（系统默认），无需自定义 |

---

## 11. 安全模型

### 11.1 当前模型（M1）

- **传输加密**：WebRTC 自带 DTLS-SRTP，视频与 DataChannel 全链路端到端加密
- **信令加密**：M1 ws 是 `ws://`（明文），仅 LAN 使用。理论上同网段攻击者可看到 SDP/ICE，但 DTLS 在 PC 建立时会校验 fingerprint，中间人篡改 SDP 会导致 PC 建立失败而非劫持
- **鉴权**：6 位 Base32 配对码（≈31 bit 熵） + 5min TTL + 3 次锁定 60s
  - 暴力破解期望尝试 ~ 5×10⁸ 次，配合锁定足以应对人工与脚本攻击
- **授权**：Agent 启动每次都需要用户在被控机上看到配对码后告知 viewer，无持久化「记住设备」
- **进程隔离**：Electron 标准沙箱（contextIsolation、sandbox renderer）

### 11.2 已知风险（接受 / 待 M2 处理）

| 风险 | 状态 |
|---|---|
| 信令明文 → SDP 可被嗅探 | 接受（DTLS 防中间人），M2 切 `wss://` |
| ws server 绑定 `0.0.0.0` | 接受，依赖配对码鉴权；M2 增加 origin / token 检查 |
| Agent 无设备级身份验证 | M2 引入设备指纹与白名单 |
| 没有审计日志 | electron-log 留有连接记录，未结构化 |

---

## 12. UI 设计要点

### 12.1 Agent UI

- **主窗口**（启动即显示）：
  - 大字显示当前配对码 + 剩余有效期倒计时
  - 「复制配对码」按钮
  - 当前状态（pairing / connecting / active）
  - 当前权限状态（屏幕录制 / 辅助功能 ✓/✗ + 引导链接）
  - 当前局域网信令地址 `host:port`（手动连接用）
- **悬浮 HUD**（仅 `active` 状态显示）：
  - 半透明小条，置顶 always-on-top，位于屏幕右上角
  - 显示「正在被控制」+ 控制端识别串（最后 4 位）
  - 红色「立即断开」按钮（鼠标键盘命中区域要大）
- **托盘菜单**：当前状态、显示主窗口、退出

### 12.2 Viewer UI

- **主视图**（启动后）：
  - 左侧：mDNS 发现的 Agent 列表，含主机名 + IP
  - 右侧：「手动添加」表单（host / port / pair code）
- **连接中**：进度提示，可取消
- **流媒体视图**：
  - 顶部工具栏：连接状态、RTT、码率、帧率、丢包率、分辨率、断开按钮、全屏按钮
  - 中央：`<video>` 元素，`object-fit: contain`，黑色背景
  - 全屏模式下工具栏自动隐藏，鼠标移到顶部唤出
- **统计数据来源**：`pc.getStats()` 1s 轮询，提取 `currentRoundTripTime`、`framesPerSecond`、`bytesReceived`、`packetsLost`、`frameWidth`/`frameHeight`

---

## 13. 性能预算

### 13.1 目标指标（LAN）

| 指标 | 目标 |
|---|---|
| 端到端鼠标延迟 | < 80ms |
| 视频分辨率 | 自适应 720p~1080p |
| 帧率 | 30~60fps |
| Agent CPU（Apple Silicon） | < 25% |
| Viewer CPU | < 15% |
| 视频码率 | ≤ 8 Mbps |
| 连接建立时间 | < 3s（输入配对码后） |

### 13.2 监控手段

- Viewer 工具栏实时显示上述指标
- 开发模式（`NODE_ENV=development`）下，主进程日志打印每秒 stats 快照

---

## 14. 测试策略

### 14.1 单元测试覆盖（必须）

| 包 | 模块 | 覆盖点 |
|---|---|---|
| shared | `coords.ts` | letterbox 计算（横/竖/相等/极端比例）、归一化、clamp |
| shared | `pairing.ts` | 生成熵、constant-time 校验、字母表无歧义字符 |
| shared | `protocol/*` | zod schema 解析成功 / 失败 / 未知字段处理 |
| signaling | `transport/embedded-*.ts` | 启停、消息回环、断线回调 |
| desktop/main | Agent 状态机 | 全部迁移路径，含错误码与锁定 |
| desktop/main | mDNS 包装 | 广播、发现、超时 |

工具：Vitest。目标行覆盖率 80%+（核心模块 95%+）。

### 14.2 手动测试清单（写入 README）

1. 启动 Agent（macOS / Windows 各一次）
2. 启动 Viewer，确认 mDNS 发现
3. 输入配对码，观察视频显现 < 3s
4. 鼠标移动、点击、右键、滚轮
5. 键盘输入英文、组合键（Cmd+C、Cmd+Tab）
6. 故意输错 3 次配对码，确认锁定
7. Agent 端点击断开，Viewer 端 UI 正确回到列表
8. Viewer 端关闭窗口，Agent 端回到 pairing 状态
9. 拔网线模拟断网，UI 提示
10. 同时启动第二个 Viewer 尝试连接，应被拒绝
11. 长按 Shift 后突然关闭 Viewer，确认 Agent 端无残留按键

### 14.3 不在 MVP 范围

- E2E 自动化（Electron + WebRTC，性价比低）
- 跨平台 CI 打包

---

## 15. 关键常量

```typescript
// shared/src/constants.ts
export const PROTOCOL_VERSION = 1

export const PAIR_CODE_LENGTH = 6
export const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const PAIR_CODE_TTL_MS = 5 * 60_000
export const PAIR_MAX_ATTEMPTS = 3
export const PAIR_LOCKOUT_MS = 60_000

export const KEEPALIVE_INTERVAL_MS = 3_000
export const KEEPALIVE_TIMEOUT_MS = 10_000
export const ICE_GATHERING_TIMEOUT_MS = 10_000

export const VIDEO_MAX_BITRATE_BPS = 8_000_000
export const VIDEO_MAX_FRAMERATE = 60

export const MOUSE_THROTTLE_HZ = 120
export const MOUSE_BUFFER_THRESHOLD_BYTES = 64 * 1024
export const MODIFIER_SYNC_INTERVAL_MS = 1_000

export const MDNS_SERVICE_TYPE = 'remote-desktop'
export const MDNS_PROTOCOL = 'tcp'

export const DC_MOUSE_LABEL = 'mouse'
export const DC_KEYBOARD_LABEL = 'keyboard'

export const QUIT_CLEANUP_TIMEOUT_MS = 2_000
```

---

## 16. 风险与未决问题

| 风险 / 未决 | 影响 | 缓解 / 决策 |
|---|---|---|
| nut-js 在 Windows 控制 elevated app | 控不了 UAC 提升的窗口 | MVP 接受；文档明示 |
| `desktopCapturer` 在 macOS Sonoma+ 弹「内容选择器」 | 每次启动可能要选 | 接受，写入已知限制 |
| H.264 在某些 Linux Electron 构建未启用 | 不影响 macOS/Win | M1 不支持 Linux Agent |
| 信令明文 ws | 同网段嗅探 | M2 切 wss |
| Viewer 高分屏映射到 Agent 低分屏 | 文字模糊但可用 | 接受 |
| 同时打开多 Viewer | 拒绝，仅 1:1 | 设计如此 |

---

## 17. M2 演进路径

### 17.1 公网中继（M2-a）

新增 `packages/relay-server/`：

- 一个无状态 Node + ws 服务，按 `roomId` 配对 Agent 与 Viewer
- Agent 启动连接 relay，注册 `roomId`（即配对码或扩展形式）
- Viewer 连 relay，发送 `roomId` 与 pair-code
- 协议层完全复用 §7.1（再增加 `join-room` 类型）
- `SignalingTransport` 添加 `RelayClientTransport` 实现

附加：

- TURN 服务器集成（自建 coturn 或第三方）
- ICE servers 配置从 Agent UI 暴露
- 信令切 `wss://`

### 17.2 移动端 Viewer（M2-b）

新增 `packages/mobile-viewer/`（React Native）：

- 复用 `shared/` 与 `signaling/protocol/`
- `react-native-webrtc` 替代浏览器 WebRTC
- 触摸映射层：单指点击 → 左键 / 长按 → 右键 / 双指拖动 → 滚轮 / 捏合 → 滚轮缩放
- mDNS 在 RN 上能力受限，依赖手动 IP 输入或 QR 扫码

---

## 附录 A：术语表

| 词 | 含义 |
|---|---|
| Agent | 被控端，运行 Electron + nut-js |
| Viewer | 控制端，运行 Electron |
| Signaling | 信令通道，承载 SDP/ICE/配对消息 |
| PC | RTCPeerConnection |
| DC | RTCDataChannel |
| LAN | 局域网 |
| TURN | Traversal Using Relays around NAT |
| HUD | Heads-Up Display（悬浮指示条） |
| TTL | Time To Live |

---

*END OF DOCUMENT*
