# desk-controller 项目规范

> Claude Code 在本仓库工作时必读。任何与本文冲突的「惯例」「常见做法」一律以本文为准。规范要改，先改本文，再改实践，禁止反过来。

---

## 1. 项目是什么

跨平台远程桌面控制系统。Viewer（控制端）通过 WebRTC 接收 Agent（被控端）的桌面视频流，并通过 DataChannel 下发键鼠指令。M1 范围限定为局域网 + 桌面双端。

**权威设计文档**：[docs/specs/2026-05-17-remote-desktop-design.md](docs/specs/2026-05-17-remote-desktop-design.md)

本文档只列「在本仓库里干活的规则」，不重复设计文档里的架构与协议。**写代码前先读设计文档**，特别是 §5（进程边界）、§7（协议）、§9（关键算法）、§15（关键常量）。

---

## 2. 目录约定

```
packages/
├── desktop/          Electron 应用（Agent + Viewer 双模式，模式见设计文档 §5.0）
├── signaling/        信令协议 + Transport 抽象与实现（禁止依赖 Electron API）
├── relay-server/     M2 预留，本阶段保留空骨架
└── mobile-viewer/    M2 预留，本阶段保留空骨架
shared/               跨包共享：类型、协议、常量、纯函数（零运行时依赖，禁止依赖任何其他包）
docs/specs/           设计文档与变更记录，文件命名 YYYY-MM-DD-<topic>-design.md
```

**包依赖规则（不可违反）**：

- `shared/` 不能 import 任何其他包
- `signaling/` 只能 import `shared/`，**不能** import 任何 Electron / Node-only API（否则破坏 M2 中继复用）
- `desktop/` 可以 import `shared/` 与 `signaling/`
- 跨包引用一律用 `workspace:*`，不要用相对路径跨包

新增包前先在本文档登记，未登记的包不要建。

---

## 3. 技术栈（已锁定，不要随意替换）

| 类别 | 选择 |
|---|---|
| 包管理 | pnpm workspaces |
| 构建 | electron-vite |
| 语言 | TypeScript（strict 必开） |
| 前端 | React 18 + Zustand |
| 样式 | Tailwind CSS + shadcn/ui |
| 信令 | `ws`（main 进程） |
| 发现 | `bonjour-service` |
| 输入注入 | `@nut-tree-fork/nut-js` |
| 协议校验 | `zod`（信令与控制消息全部走 schema） |
| 日志 | `electron-log` |
| 持久化 | `electron-store` |
| 测试 | Vitest |
| Lint | ESLint + Prettier，提交前 husky + lint-staged |

替换任何一项前在本文档与设计文档里改记录。

---

## 4. 代码约定

- **TypeScript strict 必开**，包含 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`
- **协议消息**统一用 zod schema 定义，运行时一律 `schema.parse()` 校验；未知 `type` 丢弃 + warning，**不要 throw**
- **所有常量**集中在 `shared/src/constants.ts`，禁止散落
- **错误码**用设计文档 §7.4 定义的字符串枚举，不要自创
- **跨进程通信**：renderer 不直接调任何 Node/native API，必须经 preload `contextBridge` 暴露的白名单
- **Electron 安全基线**（永远开）：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- **不写无意义注释**：注释只写 why、隐藏约束、易踩坑点；what 由命名表达
- **不写一次性 helper**：YAGNI，三次以下重复不抽象

---

## 5. 协议演进规则

- 信令消息与控制消息携带 `v` 字段，M1 固定 `v: 1`
- 新增字段必须 optional，老端忽略
- 破坏性变更（字段重命名、删除、语义变更）**必须升 `v`**，并在 hello 阶段拒绝低版本
- 修改协议前在设计文档 §7 同步更新，再改代码

---

## 6. 验证（改完必跑）

> 命令在仓库脚手架搭好后填入；脚手架未到位前，每次「完成」前至少手动跑一遍核心路径。

```bash
pnpm typecheck     # 必过
pnpm lint          # 必过
pnpm test          # 必过；coords/pairing/state-machine 等核心模块覆盖率 ≥ 95%
```

UI/端到端改动需手动测试，参考设计文档 §14.2 清单（启动 Agent / Viewer、配对、收到画面、键鼠操作、断开等）。

**不要为了让代码跑起来注释掉报错、加 `@ts-ignore`、`eslint-disable`，找根本原因**。连续两次修复失败，停下来重新分析问题。

---

## 7. 红线（操作前必须先问我）

以下命中即停，无论 auto-accept 与否：

- 删除文件、目录、git 历史
- 修改 `.env`、密钥、token、CI 配置
- 数据库 / 持久化 schema 变更（含 electron-store 已有 key 的语义变更）
- `git push` / `rebase` / `reset --hard` / 强制推送
- 安装新的全局依赖、修改系统配置
- 公开发布（npm publish、打包分发、发文章）
- 引入设计文档「非目标」清单（§1.3）里的功能——MVP 边界保持收紧，要加先改文档
- 升 `PROTOCOL_VERSION`

---

## 8. 文档与提交

- README 与 commit message **用英文**
- 设计文档、ADR、本文用**中文**
- 提交前确认 `pnpm typecheck && pnpm lint && pnpm test` 全过
- commit message 跟随仓库已有风格（首次时使用 Conventional Commits：`feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`）

---

## 9. 已知限制（不要试图「修」）

下列是设计决定，不是 bug，PR 里不要带「顺手优化」：

- 单 Agent 同时只接受 1 个 Viewer 连接，第二个直接拒绝
- 不支持 IME 输入（中文输入法）
- 只捕获主屏，不支持多显示器切换
- 不拦截/转发系统快捷键（Cmd+W 在 Viewer 自身生效，不发给 Agent）
- M1 信令明文 `ws://`，仅 LAN 用；公网走 M2
- 不做剪贴板同步、文件传输、音频回传

要改这些限制，先改设计文档「非目标」清单。
