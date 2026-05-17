# Remote Desktop M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M1 of a LAN-only desktop-to-desktop remote control system: an Electron app that, in Agent mode, streams its screen via WebRTC and injects key/mouse events from a paired Viewer; in Viewer mode, discovers Agents on the LAN, pairs by code, renders the stream, and forwards user input.

**Architecture:** pnpm monorepo. Three packages: `shared/` (pure protocol + algorithms, zero deps), `packages/signaling/` (SignalingTransport abstraction + ws-based implementations, no Electron deps), `packages/desktop/` (one Electron app, mode-selected at boot via env in dev / `electron-store` in prod). Agent is the WebRTC offerer (adds video track + creates both DataChannels in a single offer). Coordinates travel as `[0,1]` normalized against the video frame content rectangle. Signaling is embedded ws server on the Agent.

**Tech Stack:** pnpm workspaces · TypeScript strict · Electron 30+ · electron-vite · React 18 + Zustand · Tailwind · ws · bonjour-service · @nut-tree-fork/nut-js · zod · electron-log · electron-store · Vitest · ESLint + Prettier

**Authoritative reference:** [docs/specs/2026-05-17-remote-desktop-design.md](../specs/2026-05-17-remote-desktop-design.md) — every task cites the section it implements. Read the cited section before starting a task.

---

## Phase index

| Phase | Tasks | Theme |
|---|---|---|
| 0 | T01–T07 | Workspace scaffolding & tooling |
| 1 | T08–T15 | `shared/` package — strict TDD |
| 2 | T16–T20 | `packages/signaling/` — transport abstraction |
| 3 | T21–T28 | `packages/desktop/` scaffold (Electron + React shell) |
| 4 | T29–T39 | Agent role (main + renderer + UI) |
| 5 | T40–T49 | Viewer role (main + renderer + UI) |
| 6 | T50–T52 | Integration smoke + README + baseline tag |

**Testing policy per layer**

- `shared/` — strict TDD, ≥95% line coverage on `coords`, `pairing`, `protocol`
- `packages/signaling/` — behavioral tests against real ws server on ephemeral port
- `packages/desktop/main` — unit-test pure modules (pair-store, session-state); the rest is integrated by smoke
- `packages/desktop/renderer` — unit-test pure modules (sdp-munge, throttler, stats parser); React components by manual smoke
- End-to-end — manual checklist from spec §14.2, run at Phase 6

---

## Conventions used throughout this plan

- All paths are repo-relative. Repo root: `/Users/binjunwen/Desktop/desk-controller`.
- After every task, the engineer runs `pnpm typecheck && pnpm lint && pnpm test` (or per-package equivalent if root scripts not yet wired in early phases) before committing.
- Commit messages: Conventional Commits, English, scope-prefixed (e.g., `feat(shared): add coords letterbox calc`).
- Each task ends with `git add <paths> && git commit -m "..."` — never `git add .`.
- If a `pnpm` script doesn't exist yet, the task that needs it adds it to the corresponding `package.json`.

---

## Phase 0 — Workspace Scaffolding

### T01: Initialize pnpm workspace root

**Implements:** spec §4 (Monorepo Structure)

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`

- [ ] **Step 1: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - 'shared'
  - 'packages/*'
```

- [ ] **Step 2: Write `.npmrc`** (pin engine-strict, deterministic installs)

```ini
engine-strict=true
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=false
```

- [ ] **Step 3: Write root `package.json`**

```json
{
  "name": "desk-controller",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.11.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint && prettier --check .",
    "format": "prettier --write .",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "prettier": "^3.3.3",
    "typescript": "^5.6.2"
  }
}
```

- [ ] **Step 4: Install**

Run: `pnpm install`
Expected: `Done in <Xs>` with no errors; `pnpm-lock.yaml` created.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc pnpm-lock.yaml
git commit -m "chore: init pnpm workspace"
```

---

### T02: TypeScript base config

**Files:**
- Create: `tsconfig.base.json`

- [ ] **Step 1: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: add strict TypeScript base config"
```

---

### T03: Prettier + ESLint

**Files:**
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `eslint.config.js`
- Modify: `package.json` (add eslint deps)

- [ ] **Step 1: Write `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

- [ ] **Step 2: Write `.prettierignore`**

```
node_modules
dist
out
.vite
pnpm-lock.yaml
coverage
```

- [ ] **Step 3: Install ESLint stack**

Run:
```bash
pnpm add -D -w eslint @eslint/js typescript-eslint eslint-plugin-react eslint-plugin-react-hooks
```

- [ ] **Step 4: Write `eslint.config.js`** (flat config)

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/out/**', '**/.vite/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { globals: { window: true, document: true } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
    settings: { react: { version: '18.3' } },
  },
)
```

- [ ] **Step 5: Add root lint script and verify**

In root `package.json` `scripts`, replace `lint` with:
```json
"lint": "eslint . && prettier --check ."
```

Run: `pnpm lint`
Expected: passes (no source files yet).

- [ ] **Step 6: Commit**

```bash
git add .prettierrc.json .prettierignore eslint.config.js package.json pnpm-lock.yaml
git commit -m "chore: configure prettier and eslint flat config"
```

---

### T04: husky + lint-staged

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json`

- [ ] **Step 1: Install**

Run:
```bash
pnpm add -D -w husky lint-staged
pnpm exec husky init
```

- [ ] **Step 2: Write `.husky/pre-commit`**

```sh
pnpm exec lint-staged
```

- [ ] **Step 3: Add `lint-staged` to root `package.json`** (top level)

```json
"lint-staged": {
  "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml,yaml,css}": ["prettier --write"]
}
```

- [ ] **Step 4: Sanity check**

Touch any tracked file, `git add`, then `git commit --dry-run -m "test"`. Confirm hook fires (you should see `[STARTED]` lines from lint-staged). Use `git reset HEAD` to unstage.

- [ ] **Step 5: Commit**

```bash
git add .husky/pre-commit package.json pnpm-lock.yaml
git commit -m "chore: add husky pre-commit with lint-staged"
```

---

### T05: Vitest at root

**Files:**
- Create: `vitest.workspace.ts`
- Modify: `package.json`

- [ ] **Step 1: Install**

Run: `pnpm add -D -w vitest @vitest/coverage-v8`

- [ ] **Step 2: Write `vitest.workspace.ts`**

```ts
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'shared',
  'packages/signaling',
  'packages/desktop',
])
```

- [ ] **Step 3: Update root `test` script**

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 4: Verify**

Run: `pnpm test`
Expected: `No test files found` (acceptable at this point; exit code 0 or 1 is OK — we'll have tests in Phase 1).

- [ ] **Step 5: Commit**

```bash
git add vitest.workspace.ts package.json pnpm-lock.yaml
git commit -m "chore: configure Vitest workspace"
```

---

### T06: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add typecheck/lint/test workflow"
```

---

### T07: README skeleton

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# desk-controller

LAN-only remote desktop control system (Electron + WebRTC). M1 milestone.

See [docs/specs/2026-05-17-remote-desktop-design.md](docs/specs/2026-05-17-remote-desktop-design.md) for the architecture and protocol.
See [CLAUDE.md](CLAUDE.md) for repository conventions.

## Requirements

- Node 20.11+
- pnpm 9+
- macOS 12+ or Windows 10+

## Install

\`\`\`bash
pnpm install
\`\`\`

## Develop

\`\`\`bash
pnpm dev:agent    # run Electron as Agent (will be controlled)
pnpm dev:viewer   # run Electron as Viewer (will control)
\`\`\`

The two run in independent Electron instances with separate userData paths.

## Verify

\`\`\`bash
pnpm typecheck
pnpm lint
pnpm test
\`\`\`

## Manual test plan

See spec §14.2.
```

(The triple backticks above are escaped — paste them verbatim into the file.)

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README skeleton"
```

---

## Phase 1 — `shared/` package (strict TDD)

### T08: Skeleton `shared/` package

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/vitest.config.ts`
- Create: `shared/src/index.ts`

- [ ] **Step 1: `shared/package.json`**

```json
{
  "name": "@desk/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "typescript": "^5.6.2"
  }
}
```

- [ ] **Step 2: `shared/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: `shared/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
})
```

- [ ] **Step 4: Empty `shared/src/index.ts`**

```ts
export {}
```

- [ ] **Step 5: Install**

Run: `pnpm install`
Expected: `@desk/shared` linked in workspace.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @desk/shared typecheck`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add shared/ pnpm-lock.yaml
git commit -m "feat(shared): scaffold package"
```

---

### T09: `constants.ts`

**Implements:** spec §15

**Files:**
- Create: `shared/src/constants.ts`
- Create: `shared/tests/constants.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Failing test**

```ts
// shared/tests/constants.test.ts
import { describe, expect, it } from 'vitest'
import * as C from '../src/constants.js'

describe('constants', () => {
  it('exposes the protocol version', () => {
    expect(C.PROTOCOL_VERSION).toBe(1)
  })
  it('uses a 6-char Base32 alphabet without ambiguous chars', () => {
    expect(C.PAIR_CODE_LENGTH).toBe(6)
    expect(C.PAIR_CODE_ALPHABET).not.toMatch(/[ILO01]/)
    expect(C.PAIR_CODE_ALPHABET.length).toBeGreaterThanOrEqual(30)
  })
  it('uses sane TTLs and bitrates', () => {
    expect(C.PAIR_CODE_TTL_MS).toBe(5 * 60_000)
    expect(C.PAIR_MAX_ATTEMPTS).toBe(3)
    expect(C.PAIR_LOCKOUT_MS).toBe(60_000)
    expect(C.VIDEO_MAX_BITRATE_BPS).toBe(8_000_000)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @desk/shared test`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// shared/src/constants.ts
export const PROTOCOL_VERSION = 1 as const

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

export const MOUSE_THROTTLE_MIN_INTERVAL_MS = 8
export const MOUSE_BUFFER_THRESHOLD_BYTES = 64 * 1024
export const MODIFIER_SYNC_INTERVAL_MS = 1_000

export const MDNS_SERVICE_TYPE = 'remote-desktop'
export const MDNS_PROTOCOL = 'tcp' as const

export const DC_MOUSE_LABEL = 'mouse'
export const DC_KEYBOARD_LABEL = 'keyboard'

export const QUIT_CLEANUP_TIMEOUT_MS = 2_000
```

- [ ] **Step 4: Re-export from index**

```ts
// shared/src/index.ts
export * as constants from './constants.js'
export * from './constants.js'
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @desk/shared test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/constants.ts shared/src/index.ts shared/tests/constants.test.ts
git commit -m "feat(shared): add protocol and runtime constants"
```

---

### T10: Error codes

**Implements:** spec §7.4

**Files:**
- Create: `shared/src/protocol/errors.ts`
- Create: `shared/tests/errors.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Failing test**

```ts
// shared/tests/errors.test.ts
import { describe, expect, it } from 'vitest'
import { ErrorCode, isErrorCode } from '../src/protocol/errors.js'

describe('ErrorCode', () => {
  it('contains all expected codes', () => {
    const expected = [
      'E_PAIR_INVALID_CODE',
      'E_PAIR_EXPIRED',
      'E_PAIR_TOO_MANY_ATTEMPTS',
      'E_PEER_BUSY',
      'E_VERSION_MISMATCH',
      'E_PERMISSION_SCREEN',
      'E_PERMISSION_A11Y',
      'E_ICE_FAILED',
      'E_TRANSPORT_TIMEOUT',
    ]
    for (const code of expected) {
      expect(ErrorCode[code as keyof typeof ErrorCode]).toBe(code)
    }
  })
  it('isErrorCode narrows correctly', () => {
    expect(isErrorCode('E_PAIR_INVALID_CODE')).toBe(true)
    expect(isErrorCode('not_a_code')).toBe(false)
    expect(isErrorCode(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/src/protocol/errors.ts
export const ErrorCode = {
  E_PAIR_INVALID_CODE: 'E_PAIR_INVALID_CODE',
  E_PAIR_EXPIRED: 'E_PAIR_EXPIRED',
  E_PAIR_TOO_MANY_ATTEMPTS: 'E_PAIR_TOO_MANY_ATTEMPTS',
  E_PEER_BUSY: 'E_PEER_BUSY',
  E_VERSION_MISMATCH: 'E_VERSION_MISMATCH',
  E_PERMISSION_SCREEN: 'E_PERMISSION_SCREEN',
  E_PERMISSION_A11Y: 'E_PERMISSION_A11Y',
  E_ICE_FAILED: 'E_ICE_FAILED',
  E_TRANSPORT_TIMEOUT: 'E_TRANSPORT_TIMEOUT',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

const allCodes = new Set(Object.values(ErrorCode))

export function isErrorCode(x: unknown): x is ErrorCode {
  return typeof x === 'string' && allCodes.has(x as ErrorCode)
}
```

- [ ] **Step 4: Index export**

Append to `shared/src/index.ts`:
```ts
export * from './protocol/errors.js'
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @desk/shared test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/protocol/errors.ts shared/src/index.ts shared/tests/errors.test.ts
git commit -m "feat(shared): add ErrorCode enum and guard"
```

---

### T11: Signaling protocol schemas

**Implements:** spec §7.1, §7.5

**Files:**
- Create: `shared/src/protocol/signaling.ts`
- Create: `shared/tests/signaling.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Failing test**

```ts
// shared/tests/signaling.test.ts
import { describe, expect, it } from 'vitest'
import { SignalingMessage, parseSignalingMessage } from '../src/protocol/signaling.js'

describe('signaling protocol', () => {
  it('parses a valid hello', () => {
    const msg = { v: 1, t: 'hello', role: 'agent', clientId: 'abc' }
    const parsed = parseSignalingMessage(msg)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.t).toBe('hello')
  })

  it('rejects wrong version', () => {
    const parsed = parseSignalingMessage({ v: 2, t: 'hello', role: 'agent', clientId: 'a' })
    expect(parsed.ok).toBe(false)
  })

  it('rejects unknown type', () => {
    const parsed = parseSignalingMessage({ v: 1, t: 'wat' })
    expect(parsed.ok).toBe(false)
  })

  it('parses pair-result with error reason', () => {
    const parsed = parseSignalingMessage({
      v: 1, t: 'pair-result', ok: false, reason: 'E_PAIR_INVALID_CODE',
    })
    expect(parsed.ok).toBe(true)
  })

  it('parses offer/answer/ice/bye/ping/pong', () => {
    const cases: SignalingMessage[] = [
      { v: 1, t: 'offer', sdp: 'v=0...' },
      { v: 1, t: 'answer', sdp: 'v=0...' },
      { v: 1, t: 'ice', candidate: { candidate: '', sdpMLineIndex: 0 } },
      { v: 1, t: 'bye' },
      { v: 1, t: 'ping' },
      { v: 1, t: 'pong' },
    ]
    for (const c of cases) {
      expect(parseSignalingMessage(c).ok).toBe(true)
    }
  })

  it('rejects malformed pair-request', () => {
    expect(parseSignalingMessage({ v: 1, t: 'pair-request' }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/src/protocol/signaling.ts
import { z } from 'zod'
import { PROTOCOL_VERSION } from '../constants.js'
import { ErrorCode } from './errors.js'

const Version = z.literal(PROTOCOL_VERSION)

const ErrorCodeSchema = z.nativeEnum(ErrorCode)

const IceCandidateInit = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullish(),
  sdpMLineIndex: z.number().int().nullish(),
  usernameFragment: z.string().nullish(),
})

export const SignalingMessageSchema = z.discriminatedUnion('t', [
  z.object({
    v: Version, t: z.literal('hello'),
    role: z.enum(['agent', 'viewer']),
    clientId: z.string().min(1),
  }),
  z.object({ v: Version, t: z.literal('pair-request'), code: z.string().min(1) }),
  z.object({
    v: Version, t: z.literal('pair-result'),
    ok: z.boolean(),
    reason: ErrorCodeSchema.optional(),
  }),
  z.object({ v: Version, t: z.literal('offer'), sdp: z.string().min(1) }),
  z.object({ v: Version, t: z.literal('answer'), sdp: z.string().min(1) }),
  z.object({ v: Version, t: z.literal('ice'), candidate: IceCandidateInit }),
  z.object({ v: Version, t: z.literal('bye'), reason: z.string().optional() }),
  z.object({ v: Version, t: z.literal('ping') }),
  z.object({ v: Version, t: z.literal('pong') }),
])

export type SignalingMessage = z.infer<typeof SignalingMessageSchema>

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: z.ZodError }

export function parseSignalingMessage(raw: unknown): ParseResult<SignalingMessage> {
  const parsed = SignalingMessageSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: parsed.error }
}
```

- [ ] **Step 4: Index**

Append to `shared/src/index.ts`:
```ts
export * from './protocol/signaling.js'
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @desk/shared test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/protocol/signaling.ts shared/src/index.ts shared/tests/signaling.test.ts
git commit -m "feat(shared): add signaling message schemas"
```

---

### T12: Control protocol schemas

**Implements:** spec §7.2

**Files:**
- Create: `shared/src/protocol/control.ts`
- Create: `shared/tests/control.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Failing test**

```ts
// shared/tests/control.test.ts
import { describe, expect, it } from 'vitest'
import {
  parseMouseMsg, parseKeyMsg,
  Mods, encodeMods, decodeMods,
} from '../src/protocol/control.js'

describe('mouse messages', () => {
  it('accepts mm/md/mu/mw', () => {
    expect(parseMouseMsg({ t: 'mm', x: 0.5, y: 0.5 }).ok).toBe(true)
    expect(parseMouseMsg({ t: 'md', x: 0, y: 0, b: 0 }).ok).toBe(true)
    expect(parseMouseMsg({ t: 'mu', x: 1, y: 1, b: 2 }).ok).toBe(true)
    expect(parseMouseMsg({ t: 'mw', x: 0.5, y: 0.5, dx: 0, dy: -1 }).ok).toBe(true)
  })
  it('rejects invalid button index', () => {
    expect(parseMouseMsg({ t: 'md', x: 0, y: 0, b: 5 }).ok).toBe(false)
  })
  it('rejects out-of-range coords (will be clamped at sink, but schema allows any number)', () => {
    // schema accepts any number; clamping is done at injection site
    expect(parseMouseMsg({ t: 'mm', x: -1, y: 2 }).ok).toBe(true)
  })
})

describe('key messages', () => {
  it('accepts kd/ku/sync/rk', () => {
    expect(parseKeyMsg({ t: 'kd', code: 'KeyA', mods: 0 }).ok).toBe(true)
    expect(parseKeyMsg({ t: 'ku', code: 'KeyA', mods: Mods.Shift }).ok).toBe(true)
    expect(parseKeyMsg({ t: 'sync', mods: 0, keys: [] }).ok).toBe(true)
    expect(parseKeyMsg({ t: 'rk' }).ok).toBe(true)
  })
})

describe('mods bitmask', () => {
  it('encodes/decodes', () => {
    const mods = encodeMods({ shift: true, ctrl: false, alt: true, meta: false })
    expect(mods).toBe(Mods.Shift | Mods.Alt)
    expect(decodeMods(mods)).toEqual({ shift: true, ctrl: false, alt: true, meta: false })
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/src/protocol/control.ts
import { z } from 'zod'

export const Mods = {
  Shift: 1,
  Ctrl: 2,
  Alt: 4,
  Meta: 8,
} as const

export type ModSet = { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean }

export function encodeMods(m: ModSet): number {
  return (
    (m.shift ? Mods.Shift : 0) |
    (m.ctrl ? Mods.Ctrl : 0) |
    (m.alt ? Mods.Alt : 0) |
    (m.meta ? Mods.Meta : 0)
  )
}

export function decodeMods(n: number): ModSet {
  return {
    shift: (n & Mods.Shift) !== 0,
    ctrl: (n & Mods.Ctrl) !== 0,
    alt: (n & Mods.Alt) !== 0,
    meta: (n & Mods.Meta) !== 0,
  }
}

const Button = z.union([z.literal(0), z.literal(1), z.literal(2)])

export const MouseMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('mm'), x: z.number(), y: z.number() }),
  z.object({ t: z.literal('md'), x: z.number(), y: z.number(), b: Button }),
  z.object({ t: z.literal('mu'), x: z.number(), y: z.number(), b: Button }),
  z.object({
    t: z.literal('mw'), x: z.number(), y: z.number(),
    dx: z.number(), dy: z.number(),
  }),
])

export const KeyMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('kd'), code: z.string().min(1), mods: z.number().int().nonnegative() }),
  z.object({ t: z.literal('ku'), code: z.string().min(1), mods: z.number().int().nonnegative() }),
  z.object({
    t: z.literal('sync'),
    mods: z.number().int().nonnegative(),
    keys: z.array(z.string()),
  }),
  z.object({ t: z.literal('rk') }),
])

export type MouseMsg = z.infer<typeof MouseMsgSchema>
export type KeyMsg = z.infer<typeof KeyMsgSchema>

type ParseResult<T> = { ok: true; value: T } | { ok: false }

export function parseMouseMsg(raw: unknown): ParseResult<MouseMsg> {
  const r = MouseMsgSchema.safeParse(raw)
  return r.success ? { ok: true, value: r.data } : { ok: false }
}

export function parseKeyMsg(raw: unknown): ParseResult<KeyMsg> {
  const r = KeyMsgSchema.safeParse(raw)
  return r.success ? { ok: true, value: r.data } : { ok: false }
}
```

- [ ] **Step 4: Index**

Append to `shared/src/index.ts`:
```ts
export * from './protocol/control.js'
```

- [ ] **Step 5: Verify & commit**

```bash
pnpm --filter @desk/shared test
git add shared/src/protocol/control.ts shared/src/index.ts shared/tests/control.test.ts
git commit -m "feat(shared): add mouse/keyboard control schemas"
```

---

### T13: Coordinate math (letterbox + normalize + scale)

**Implements:** spec §9.1, §9.2

**Files:**
- Create: `shared/src/coords.ts`
- Create: `shared/tests/coords.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Failing test**

```ts
// shared/tests/coords.test.ts
import { describe, expect, it } from 'vitest'
import { computeContentRect, normalizedToScreen, clamp01 } from '../src/coords.js'

describe('computeContentRect', () => {
  it('returns full DOM when ratios match', () => {
    expect(computeContentRect(800, 400, 1920, 960)).toEqual({ x: 0, y: 0, w: 800, h: 400 })
  })
  it('video wider than DOM → top/bottom bars', () => {
    // dom 800x800 (1:1), video 1920x1080 (16:9)
    const r = computeContentRect(800, 800, 1920, 1080)
    expect(r.x).toBe(0)
    expect(r.w).toBe(800)
    expect(r.h).toBeCloseTo(450, 1)
    expect(r.y).toBeCloseTo(175, 1)
  })
  it('video taller than DOM → left/right bars', () => {
    // dom 1000x500 (2:1), video 1080x1920 (9:16)
    const r = computeContentRect(1000, 500, 1080, 1920)
    expect(r.y).toBe(0)
    expect(r.h).toBe(500)
    expect(r.w).toBeCloseTo(281.25, 1)
    expect(r.x).toBeCloseTo(359.375, 1)
  })
  it('handles zero-sized inputs gracefully', () => {
    expect(computeContentRect(0, 100, 100, 100)).toEqual({ x: 0, y: 0, w: 0, h: 100 })
    expect(computeContentRect(100, 100, 0, 100)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})

describe('normalizedToScreen', () => {
  it('rounds to nearest integer', () => {
    expect(normalizedToScreen({ x: 0.5, y: 0.5 }, { width: 1920, height: 1080 }))
      .toEqual({ x: 960, y: 540 })
  })
  it('handles edges', () => {
    expect(normalizedToScreen({ x: 0, y: 0 }, { width: 100, height: 100 })).toEqual({ x: 0, y: 0 })
    expect(normalizedToScreen({ x: 1, y: 1 }, { width: 100, height: 100 })).toEqual({ x: 100, y: 100 })
  })
})

describe('clamp01', () => {
  it('clamps below 0 and above 1', () => {
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(1.5)).toBe(1)
    expect(clamp01(0.7)).toBe(0.7)
    expect(clamp01(Number.NaN)).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/src/coords.ts
export type Rect = { x: number; y: number; w: number; h: number }
export type Point = { x: number; y: number }
export type Size = { width: number; height: number }

export function computeContentRect(
  domW: number, domH: number,
  videoW: number, videoH: number,
): Rect {
  if (videoW <= 0 || videoH <= 0 || domW <= 0 || domH <= 0) {
    return { x: 0, y: 0, w: domW > 0 && videoW > 0 ? domW : 0, h: videoH > 0 && domH > 0 ? domH : 0 }
  }
  const domRatio = domW / domH
  const vidRatio = videoW / videoH
  if (vidRatio > domRatio) {
    const h = domW / vidRatio
    return { x: 0, y: (domH - h) / 2, w: domW, h }
  }
  const w = domH * vidRatio
  return { x: (domW - w) / 2, y: 0, w, h: domH }
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return n < 0 ? 0 : n > 1 ? 1 : n
}

export function normalizedToScreen(p: Point, size: Size): Point {
  return {
    x: Math.round(clamp01(p.x) * size.width),
    y: Math.round(clamp01(p.y) * size.height),
  }
}
```

- [ ] **Step 4: Index + verify + commit**

Append to `shared/src/index.ts`:
```ts
export * from './coords.js'
```

```bash
pnpm --filter @desk/shared test
git add shared/src/coords.ts shared/src/index.ts shared/tests/coords.test.ts
git commit -m "feat(shared): add coord/letterbox utilities"
```

---

### T14: Pair-code generation, verification, and lockout store

**Implements:** spec §9.5, §10 (pairing rows)

**Files:**
- Create: `shared/src/pairing.ts`
- Create: `shared/tests/pairing.test.ts`
- Modify: `shared/src/index.ts`

- [ ] **Step 1: Failing test**

```ts
// shared/tests/pairing.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  generatePairCode, verifyPairCode, PairStore,
} from '../src/pairing.js'
import { PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH, PAIR_LOCKOUT_MS, PAIR_MAX_ATTEMPTS, PAIR_CODE_TTL_MS } from '../src/constants.js'

describe('generatePairCode', () => {
  it('produces correct length and only legal chars', () => {
    for (let i = 0; i < 100; i++) {
      const code = generatePairCode()
      expect(code).toHaveLength(PAIR_CODE_LENGTH)
      for (const ch of code) expect(PAIR_CODE_ALPHABET).toContain(ch)
    }
  })
  it('has reasonable entropy (no obvious bias over 1000 samples)', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 1000; i++) {
      for (const ch of generatePairCode()) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1)
      }
    }
    // every alphabet char should appear at least once across 6000 chars
    for (const ch of PAIR_CODE_ALPHABET) {
      expect(counts.get(ch) ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('verifyPairCode', () => {
  it('matches identical strings', () => {
    expect(verifyPairCode('ABCDEF', 'ABCDEF')).toBe(true)
  })
  it('rejects different strings of same length', () => {
    expect(verifyPairCode('ABCDEF', 'ABCDEG')).toBe(false)
  })
  it('rejects different lengths', () => {
    expect(verifyPairCode('ABCDE', 'ABCDEF')).toBe(false)
  })
})

describe('PairStore', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z')) })

  it('issues a code on creation with TTL set', () => {
    const s = new PairStore()
    const snap = s.snapshot()
    expect(snap.code).toHaveLength(PAIR_CODE_LENGTH)
    expect(snap.expiresAt).toBe(Date.now() + PAIR_CODE_TTL_MS)
    expect(snap.attempts).toBe(0)
    expect(snap.lockedUntil).toBeUndefined()
  })

  it('verify(ok) does not consume attempts', () => {
    const s = new PairStore()
    const code = s.snapshot().code
    expect(s.verify(code)).toEqual({ ok: true })
    expect(s.snapshot().attempts).toBe(0)
  })

  it('verify(bad) increments attempts; reaching max locks and rotates', () => {
    const s = new PairStore()
    const original = s.snapshot().code
    for (let i = 1; i < PAIR_MAX_ATTEMPTS; i++) {
      const r = s.verify('NOPE12')
      expect(r).toEqual({ ok: false, reason: 'E_PAIR_INVALID_CODE' })
      expect(s.snapshot().attempts).toBe(i)
    }
    const last = s.verify('NOPE12')
    expect(last).toEqual({ ok: false, reason: 'E_PAIR_TOO_MANY_ATTEMPTS' })
    const snap = s.snapshot()
    expect(snap.lockedUntil).toBe(Date.now() + PAIR_LOCKOUT_MS)
    expect(snap.code).not.toBe(original)
    expect(snap.attempts).toBe(0)
  })

  it('rejects all attempts during lockout', () => {
    const s = new PairStore()
    for (let i = 0; i < PAIR_MAX_ATTEMPTS; i++) s.verify('NOPE12')
    const r = s.verify(s.snapshot().code)
    expect(r).toEqual({ ok: false, reason: 'E_PAIR_TOO_MANY_ATTEMPTS' })
  })

  it('clears lockout after PAIR_LOCKOUT_MS', () => {
    const s = new PairStore()
    for (let i = 0; i < PAIR_MAX_ATTEMPTS; i++) s.verify('NOPE12')
    vi.advanceTimersByTime(PAIR_LOCKOUT_MS + 1)
    const code = s.snapshot().code
    expect(s.verify(code)).toEqual({ ok: true })
  })

  it('rotates code after TTL expiry on next snapshot()', () => {
    const s = new PairStore()
    const original = s.snapshot().code
    vi.advanceTimersByTime(PAIR_CODE_TTL_MS + 1)
    const after = s.snapshot()
    expect(after.code).not.toBe(original)
    expect(after.expiresAt).toBe(Date.now() + PAIR_CODE_TTL_MS)
  })

  it('verify of expired code returns E_PAIR_EXPIRED and does not count as attempt', () => {
    const s = new PairStore()
    const original = s.snapshot().code
    vi.advanceTimersByTime(PAIR_CODE_TTL_MS + 1)
    const r = s.verify(original)
    expect(r).toEqual({ ok: false, reason: 'E_PAIR_EXPIRED' })
    expect(s.snapshot().attempts).toBe(0)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/src/pairing.ts
import { webcrypto } from 'node:crypto'
import {
  PAIR_CODE_ALPHABET, PAIR_CODE_LENGTH, PAIR_CODE_TTL_MS,
  PAIR_LOCKOUT_MS, PAIR_MAX_ATTEMPTS,
} from './constants.js'
import { ErrorCode } from './protocol/errors.js'

const ALPHABET_LEN = PAIR_CODE_ALPHABET.length

export function generatePairCode(): string {
  const bytes = new Uint8Array(PAIR_CODE_LENGTH)
  webcrypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += PAIR_CODE_ALPHABET[b % ALPHABET_LEN]
  return out
}

export function verifyPairCode(input: string, expected: string): boolean {
  if (input.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < input.length; i++) {
    diff |= input.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

export type PairSnapshot = {
  code: string
  expiresAt: number
  attempts: number
  lockedUntil?: number
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: ErrorCode }

export class PairStore {
  private code: string
  private expiresAt: number
  private attempts = 0
  private lockedUntil?: number

  constructor() {
    this.code = generatePairCode()
    this.expiresAt = Date.now() + PAIR_CODE_TTL_MS
  }

  snapshot(): PairSnapshot {
    this.refreshIfExpired()
    return {
      code: this.code,
      expiresAt: this.expiresAt,
      attempts: this.attempts,
      ...(this.lockedUntil !== undefined ? { lockedUntil: this.lockedUntil } : {}),
    }
  }

  verify(input: string): VerifyResult {
    const now = Date.now()
    if (this.lockedUntil !== undefined) {
      if (now < this.lockedUntil) return { ok: false, reason: ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS }
      this.lockedUntil = undefined
    }
    if (now >= this.expiresAt) {
      this.refreshIfExpired()
      return { ok: false, reason: ErrorCode.E_PAIR_EXPIRED }
    }
    if (verifyPairCode(input, this.code)) {
      return { ok: true }
    }
    this.attempts += 1
    if (this.attempts >= PAIR_MAX_ATTEMPTS) {
      this.lockedUntil = now + PAIR_LOCKOUT_MS
      this.attempts = 0
      this.code = generatePairCode()
      this.expiresAt = now + PAIR_CODE_TTL_MS
      return { ok: false, reason: ErrorCode.E_PAIR_TOO_MANY_ATTEMPTS }
    }
    return { ok: false, reason: ErrorCode.E_PAIR_INVALID_CODE }
  }

  /** External signal: a session became active; freeze rotation until released. */
  freeze(): void { /* current implementation auto-handles via session-state callers */ }

  private refreshIfExpired(): void {
    const now = Date.now()
    if (now >= this.expiresAt) {
      this.code = generatePairCode()
      this.expiresAt = now + PAIR_CODE_TTL_MS
      this.attempts = 0
    }
  }
}
```

- [ ] **Step 4: Index + verify + commit**

Append to `shared/src/index.ts`:
```ts
export * from './pairing.js'
```

```bash
pnpm --filter @desk/shared test
git add shared/src/pairing.ts shared/src/index.ts shared/tests/pairing.test.ts
git commit -m "feat(shared): add pair code generation/verification + PairStore"
```

---

### T15: Final `shared/` index audit + coverage check

**Files:**
- Modify: `shared/src/index.ts` (verify nothing is missed)

- [ ] **Step 1: Inspect `shared/src/index.ts` — must re-export all of:**

```ts
export * from './constants.js'
export * from './coords.js'
export * from './pairing.js'
export * from './protocol/errors.js'
export * from './protocol/signaling.js'
export * from './protocol/control.js'
```

- [ ] **Step 2: Run coverage**

Run: `pnpm --filter @desk/shared exec vitest run --coverage`
Expected: ≥95% line / function coverage on `src/**`.
If below threshold, add tests, do not adjust the threshold.

- [ ] **Step 3: Commit if `index.ts` was changed**

```bash
git add shared/src/index.ts
git commit -m "chore(shared): finalize barrel exports" || true
```

---

## Phase 2 — `packages/signaling/` package

### T16: Skeleton + envelope + version handshake

**Implements:** spec §5.3, §7.5

**Files:**
- Create: `packages/signaling/package.json`
- Create: `packages/signaling/tsconfig.json`
- Create: `packages/signaling/vitest.config.ts`
- Create: `packages/signaling/src/index.ts`
- Create: `packages/signaling/src/envelope.ts`
- Create: `packages/signaling/tests/envelope.test.ts`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@desk/signaling",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "@desk/shared": "workspace:*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.13",
    "vitest": "^2.1.0",
    "typescript": "^5.6.2"
  }
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
```

- [ ] **Step 4: Failing test for envelope**

```ts
// packages/signaling/tests/envelope.test.ts
import { describe, expect, it } from 'vitest'
import { encodeMessage, decodeMessage } from '../src/envelope.js'
import type { SignalingMessage } from '@desk/shared'

describe('envelope', () => {
  it('roundtrips a valid message', () => {
    const msg: SignalingMessage = { v: 1, t: 'hello', role: 'agent', clientId: 'a' }
    const encoded = encodeMessage(msg)
    expect(typeof encoded).toBe('string')
    const decoded = decodeMessage(encoded)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(decoded.value).toEqual(msg)
  })
  it('rejects garbage JSON', () => {
    const r = decodeMessage('not-json')
    expect(r.ok).toBe(false)
  })
  it('rejects unknown type with reason', () => {
    const r = decodeMessage(JSON.stringify({ v: 1, t: 'wat' }))
    expect(r.ok).toBe(false)
  })
  it('rejects wrong version', () => {
    const r = decodeMessage(JSON.stringify({ v: 2, t: 'ping' }))
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 5: Run — expect FAIL**

- [ ] **Step 6: Implement**

```ts
// packages/signaling/src/envelope.ts
import { parseSignalingMessage, type SignalingMessage } from '@desk/shared'

export type DecodeResult =
  | { ok: true; value: SignalingMessage }
  | { ok: false; reason: 'invalid-json' | 'invalid-schema' }

export function encodeMessage(msg: SignalingMessage): string {
  return JSON.stringify(msg)
}

export function decodeMessage(raw: string): DecodeResult {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return { ok: false, reason: 'invalid-json' } }
  const r = parseSignalingMessage(parsed)
  return r.ok ? { ok: true, value: r.value } : { ok: false, reason: 'invalid-schema' }
}
```

- [ ] **Step 7: `src/index.ts`**

```ts
export * from './envelope.js'
export * from './transport/index.js'
```

(Transport index is created in T17.)

- [ ] **Step 8: Install + verify + commit**

```bash
pnpm install
pnpm --filter @desk/signaling typecheck   # may fail until T17 because of transport import
```

If it complains about `./transport/index.js`, temporarily comment that line, run test, then commit:
```bash
pnpm --filter @desk/signaling test
git add packages/signaling/ pnpm-lock.yaml
git commit -m "feat(signaling): scaffold package and envelope codec"
```

---

### T17: `SignalingTransport` interface

**Implements:** spec §5.3

**Files:**
- Create: `packages/signaling/src/transport/index.ts`

- [ ] **Step 1: Write interface**

```ts
// packages/signaling/src/transport/index.ts
import type { SignalingMessage } from '@desk/shared'

export type ConnectionState = 'open' | 'closed' | 'error'

export interface SignalingTransport {
  start(): Promise<void>
  stop(): Promise<void>
  send(msg: SignalingMessage): void
  onMessage(handler: (msg: SignalingMessage) => void): () => void
  onConnectionState(handler: (s: ConnectionState) => void): () => void
}

export type Unsubscribe = () => void
```

- [ ] **Step 2: Uncomment transport export in `src/index.ts` if you commented it**

- [ ] **Step 3: Verify + commit**

```bash
pnpm --filter @desk/signaling typecheck
git add packages/signaling/src/transport/index.ts packages/signaling/src/index.ts
git commit -m "feat(signaling): define SignalingTransport interface"
```

---

### T18: `EmbeddedServerTransport`

**Files:**
- Create: `packages/signaling/src/transport/embedded-server.ts`
- Create: `packages/signaling/tests/embedded-server.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/signaling/tests/embedded-server.test.ts
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { EmbeddedServerTransport } from '../src/transport/embedded-server.js'
import { encodeMessage } from '../src/envelope.js'

describe('EmbeddedServerTransport', () => {
  it('starts, exposes port, accepts one client, echoes ping', async () => {
    const server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    await server.start()
    const port = server.port
    expect(typeof port).toBe('number')

    const received: unknown[] = []
    server.onMessage((m) => received.push(m))

    const client = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((res) => client.once('open', () => res()))
    client.send(encodeMessage({ v: 1, t: 'ping' }))
    await new Promise((r) => setTimeout(r, 50))
    expect(received).toEqual([{ v: 1, t: 'ping' }])

    server.send({ v: 1, t: 'pong' })
    const replies: unknown[] = []
    client.on('message', (data) => replies.push(JSON.parse(data.toString())))
    await new Promise((r) => setTimeout(r, 50))
    expect(replies).toEqual([{ v: 1, t: 'pong' }])

    client.close()
    await server.stop()
  })

  it('rejects a second concurrent client with peer-busy bye', async () => {
    const server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    await server.start()
    const port = server.port

    const c1 = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((res) => c1.once('open', () => res()))

    const c2 = new WebSocket(`ws://127.0.0.1:${port}`)
    const c2Close = new Promise<void>((res) => c2.once('close', () => res()))
    await c2Close
    expect(c2.readyState).toBe(WebSocket.CLOSED)

    c1.close()
    await server.stop()
  })

  it('emits state transitions', async () => {
    const server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    const states: string[] = []
    server.onConnectionState((s) => states.push(s))
    await server.start()
    const c = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await new Promise<void>((r) => c.once('open', () => r()))
    await new Promise((r) => setTimeout(r, 20))
    expect(states).toContain('open')
    c.close()
    await server.stop()
    expect(states).toContain('closed')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/signaling/src/transport/embedded-server.ts
import { WebSocketServer, WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import type { SignalingMessage } from '@desk/shared'
import { encodeMessage, decodeMessage } from '../envelope.js'
import type { ConnectionState, SignalingTransport, Unsubscribe } from './index.js'

export type ServerOpts = { host: string; port: number }

export class EmbeddedServerTransport implements SignalingTransport {
  private server?: WebSocketServer
  private client?: WebSocket
  private msgHandlers = new Set<(m: SignalingMessage) => void>()
  private stateHandlers = new Set<(s: ConnectionState) => void>()

  constructor(private readonly opts: ServerOpts) {}

  get port(): number {
    const addr = this.server?.address()
    if (!addr || typeof addr === 'string') return 0
    return (addr as AddressInfo).port
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const wss = new WebSocketServer({ host: this.opts.host, port: this.opts.port })
      wss.once('listening', () => { this.server = wss; resolve() })
      wss.once('error', reject)
      wss.on('connection', (ws) => this.handleConnection(ws))
    })
  }

  async stop(): Promise<void> {
    this.client?.close()
    this.client = undefined
    await new Promise<void>((resolve) => this.server ? this.server.close(() => resolve()) : resolve())
    this.server = undefined
    this.emitState('closed')
  }

  send(msg: SignalingMessage): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.client.send(encodeMessage(msg))
    }
  }

  onMessage(handler: (m: SignalingMessage) => void): Unsubscribe {
    this.msgHandlers.add(handler)
    return () => this.msgHandlers.delete(handler)
  }

  onConnectionState(handler: (s: ConnectionState) => void): Unsubscribe {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  private handleConnection(ws: WebSocket): void {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      ws.send(encodeMessage({ v: 1, t: 'bye', reason: 'E_PEER_BUSY' }))
      ws.close()
      return
    }
    this.client = ws
    this.emitState('open')
    ws.on('message', (data) => {
      const r = decodeMessage(data.toString())
      if (r.ok) for (const h of this.msgHandlers) h(r.value)
    })
    ws.on('close', () => { this.client = undefined; this.emitState('closed') })
    ws.on('error', () => this.emitState('error'))
  }

  private emitState(s: ConnectionState): void {
    for (const h of this.stateHandlers) h(s)
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter @desk/signaling test
git add packages/signaling/src/transport/embedded-server.ts packages/signaling/tests/embedded-server.test.ts
git commit -m "feat(signaling): embedded ws server transport"
```

---

### T19: `EmbeddedClientTransport`

**Files:**
- Create: `packages/signaling/src/transport/embedded-client.ts`
- Create: `packages/signaling/tests/embedded-client.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/signaling/tests/embedded-client.test.ts
import { describe, expect, it } from 'vitest'
import { EmbeddedServerTransport } from '../src/transport/embedded-server.js'
import { EmbeddedClientTransport } from '../src/transport/embedded-client.js'

describe('EmbeddedClientTransport', () => {
  it('connects, exchanges messages, closes cleanly', async () => {
    const server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    await server.start()
    const serverRx: unknown[] = []
    server.onMessage((m) => serverRx.push(m))

    const client = new EmbeddedClientTransport({ host: '127.0.0.1', port: server.port })
    const clientRx: unknown[] = []
    client.onMessage((m) => clientRx.push(m))
    await client.start()

    client.send({ v: 1, t: 'ping' })
    await new Promise((r) => setTimeout(r, 30))
    expect(serverRx).toEqual([{ v: 1, t: 'ping' }])

    server.send({ v: 1, t: 'pong' })
    await new Promise((r) => setTimeout(r, 30))
    expect(clientRx).toEqual([{ v: 1, t: 'pong' }])

    await client.stop()
    await server.stop()
  })

  it('emits closed on server going away', async () => {
    const server = new EmbeddedServerTransport({ host: '127.0.0.1', port: 0 })
    await server.start()
    const client = new EmbeddedClientTransport({ host: '127.0.0.1', port: server.port })
    const states: string[] = []
    client.onConnectionState((s) => states.push(s))
    await client.start()
    await server.stop()
    await new Promise((r) => setTimeout(r, 50))
    expect(states).toContain('open')
    expect(states).toContain('closed')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/signaling/src/transport/embedded-client.ts
import WebSocket from 'ws'
import type { SignalingMessage } from '@desk/shared'
import { decodeMessage, encodeMessage } from '../envelope.js'
import type { ConnectionState, SignalingTransport, Unsubscribe } from './index.js'

export type ClientOpts = { host: string; port: number }

export class EmbeddedClientTransport implements SignalingTransport {
  private ws?: WebSocket
  private msgHandlers = new Set<(m: SignalingMessage) => void>()
  private stateHandlers = new Set<(s: ConnectionState) => void>()

  constructor(private readonly opts: ClientOpts) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${this.opts.host}:${this.opts.port}`)
      ws.once('open', () => { this.ws = ws; this.emit('open'); resolve() })
      ws.once('error', (err) => { this.emit('error'); reject(err) })
      ws.on('message', (data) => {
        const r = decodeMessage(data.toString())
        if (r.ok) for (const h of this.msgHandlers) h(r.value)
      })
      ws.on('close', () => { this.ws = undefined; this.emit('closed') })
    })
  }

  async stop(): Promise<void> {
    const ws = this.ws
    this.ws = undefined
    if (!ws) return
    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) return resolve()
      ws.once('close', () => resolve())
      ws.close()
    })
  }

  send(msg: SignalingMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMessage(msg))
    }
  }

  onMessage(handler: (m: SignalingMessage) => void): Unsubscribe {
    this.msgHandlers.add(handler)
    return () => this.msgHandlers.delete(handler)
  }

  onConnectionState(handler: (s: ConnectionState) => void): Unsubscribe {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  private emit(s: ConnectionState): void {
    for (const h of this.stateHandlers) h(s)
  }
}
```

- [ ] **Step 4: Re-export both transports**

Append to `packages/signaling/src/transport/index.ts`:
```ts
export { EmbeddedServerTransport } from './embedded-server.js'
export type { ServerOpts } from './embedded-server.js'
export { EmbeddedClientTransport } from './embedded-client.js'
export type { ClientOpts } from './embedded-client.js'
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @desk/signaling test
git add packages/signaling/src/transport/embedded-client.ts packages/signaling/src/transport/index.ts packages/signaling/tests/embedded-client.test.ts
git commit -m "feat(signaling): embedded ws client transport"
```

---

### T20: `RelayClientTransport` stub for M2

**Files:**
- Create: `packages/signaling/src/transport/relay-client.ts`

- [ ] **Step 1: Stub**

```ts
// packages/signaling/src/transport/relay-client.ts
import type { SignalingMessage } from '@desk/shared'
import type { ConnectionState, SignalingTransport, Unsubscribe } from './index.js'

export type RelayOpts = { url: string; roomId: string }

/**
 * M2 placeholder. Connects to a public rendezvous ws server and joins a room.
 * Intentionally not implemented in M1 — preserves the type contract only.
 */
export class RelayClientTransport implements SignalingTransport {
  // suppress unused-variable lint at the type level
  constructor(_opts: RelayOpts) { void _opts }
  start(): Promise<void> { throw new Error('RelayClientTransport: not implemented in M1') }
  stop(): Promise<void> { return Promise.resolve() }
  send(_msg: SignalingMessage): void { void _msg }
  onMessage(_h: (m: SignalingMessage) => void): Unsubscribe { return () => void 0 }
  onConnectionState(_h: (s: ConnectionState) => void): Unsubscribe { return () => void 0 }
}
```

Append to `packages/signaling/src/transport/index.ts`:
```ts
export { RelayClientTransport } from './relay-client.js'
export type { RelayOpts } from './relay-client.js'
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm --filter @desk/signaling typecheck
git add packages/signaling/src/transport/relay-client.ts packages/signaling/src/transport/index.ts
git commit -m "feat(signaling): RelayClientTransport stub for M2"
```

---

## Phase 3 — `packages/desktop/` scaffold

### T21: Desktop package skeleton + electron-vite + React + Tailwind

**Implements:** spec §3, §4

**Files:** numerous; listed inside steps.

- [ ] **Step 1: Create `packages/desktop/package.json`**

```json
{
  "name": "@desk/desktop",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "dependencies": {
    "@desk/shared": "workspace:*",
    "@desk/signaling": "workspace:*",
    "@nut-tree-fork/nut-js": "^4.2.2",
    "bonjour-service": "^1.2.1",
    "electron-log": "^5.2.0",
    "electron-store": "^10.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "ws": "^8.18.0",
    "zod": "^3.23.8",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "cross-env": "^7.0.3",
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/desktop/electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        external: ['@nut-tree-fork/nut-js', 'bonjour-service', 'ws', 'electron-store', 'electron-log'],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          agent: resolve(__dirname, 'src/preload/agent.ts'),
          viewer: resolve(__dirname, 'src/preload/viewer.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          agent: resolve(__dirname, 'src/renderer/agent.html'),
          viewer: resolve(__dirname, 'src/renderer/viewer.html'),
          welcome: resolve(__dirname, 'src/renderer/welcome.html'),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
      },
    },
  },
})
```

- [ ] **Step 3: Create three tsconfig files**

`packages/desktop/tsconfig.json` (renderer):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src/renderer/**/*", "src/preload/**/*"]
}
```

`packages/desktop/tsconfig.node.json` (main + tests):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src/main/**/*", "src/shared/**/*", "tests/**/*", "electron.vite.config.ts"]
}
```

- [ ] **Step 4: Tailwind + Postcss**

`packages/desktop/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

`packages/desktop/postcss.config.cjs`:
```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

- [ ] **Step 5: Renderer entry HTML files**

`packages/desktop/src/renderer/welcome.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8" /><title>desk-controller</title></head>
<body><div id="root"></div><script type="module" src="/welcome/main.tsx"></script></body></html>
```

Repeat for `agent.html` (script `/agent/main.tsx`) and `viewer.html` (script `/viewer/main.tsx`).

`packages/desktop/src/renderer/styles.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
html, body, #root { height: 100%; margin: 0; background: #0a0a0a; color: #f5f5f5; }
```

Create placeholder `main.tsx` files (will be filled by later tasks):

`packages/desktop/src/renderer/welcome/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import '../styles.css'

createRoot(document.getElementById('root')!).render(
  <div className="p-8">Welcome (T27 fills this)</div>,
)
```

Repeat shape for `agent/main.tsx` and `viewer/main.tsx` (placeholders).

- [ ] **Step 6: Main entry placeholder**

`packages/desktop/src/main/index.ts`:
```ts
import { app } from 'electron'

app.whenReady().then(() => {
  console.log('main: ready (T22-T23 fill this)')
})
```

- [ ] **Step 7: Preload placeholders**

`packages/desktop/src/preload/agent.ts`:
```ts
import { contextBridge } from 'electron'
contextBridge.exposeInMainWorld('api', { mode: 'agent' as const })
```

`packages/desktop/src/preload/viewer.ts`:
```ts
import { contextBridge } from 'electron'
contextBridge.exposeInMainWorld('api', { mode: 'viewer' as const })
```

- [ ] **Step 8: Install + verify typecheck**

```bash
pnpm install
pnpm --filter @desk/desktop typecheck
```

Expected: passes. If `@nut-tree-fork/nut-js` complains about native build on install, see [its README](https://github.com/nut-tree/nut.js/) for `electron-rebuild`. For now native module is not loaded at typecheck time.

- [ ] **Step 9: Commit**

```bash
git add packages/desktop/ pnpm-lock.yaml
git commit -m "feat(desktop): scaffold Electron + Vite + React + Tailwind"
```

---

### T22: Mode detection

**Implements:** spec §5.0

**Files:**
- Create: `packages/desktop/src/main/mode.ts`
- Create: `packages/desktop/tests/mode.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/desktop/tests/mode.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import { resolveMode } from '../src/main/mode.js'

describe('resolveMode', () => {
  beforeEach(() => { delete process.env.APP_MODE })

  it('honors APP_MODE=agent', () => {
    process.env.APP_MODE = 'agent'
    expect(resolveMode({ stored: undefined })).toBe('agent')
  })
  it('honors APP_MODE=viewer', () => {
    process.env.APP_MODE = 'viewer'
    expect(resolveMode({ stored: undefined })).toBe('viewer')
  })
  it('falls back to stored value', () => {
    expect(resolveMode({ stored: 'viewer' })).toBe('viewer')
  })
  it('returns "welcome" when neither env nor store set', () => {
    expect(resolveMode({ stored: undefined })).toBe('welcome')
  })
  it('rejects garbage env values', () => {
    process.env.APP_MODE = 'agentish'
    expect(resolveMode({ stored: undefined })).toBe('welcome')
  })
})
```

- [ ] **Step 2: Add vitest config for desktop**

`packages/desktop/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement**

```ts
// packages/desktop/src/main/mode.ts
export type AppMode = 'agent' | 'viewer' | 'welcome'

export function resolveMode(args: { stored: 'agent' | 'viewer' | undefined }): AppMode {
  const env = process.env.APP_MODE
  if (env === 'agent' || env === 'viewer') return env
  if (args.stored === 'agent' || args.stored === 'viewer') return args.stored
  return 'welcome'
}
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @desk/desktop test
git add packages/desktop/src/main/mode.ts packages/desktop/tests/mode.test.ts packages/desktop/vitest.config.ts
git commit -m "feat(desktop/main): mode resolution from env + store"
```

---

### T23: Bootstrap + single-instance + windows + clean shutdown

**Implements:** spec §10 (single-instance, exit cleanup), §5.0 (mode branching)

**Files:**
- Create: `packages/desktop/src/main/windows.ts`
- Create: `packages/desktop/src/main/single-instance.ts`
- Modify: `packages/desktop/src/main/index.ts`
- Add: root `package.json` scripts `dev:agent` / `dev:viewer`

- [ ] **Step 1: `single-instance.ts`**

```ts
// packages/desktop/src/main/single-instance.ts
import { app, type BrowserWindow } from 'electron'

export function enforceSingleInstance(onSecond: () => void): boolean {
  const got = app.requestSingleInstanceLock()
  if (!got) {
    app.quit()
    return false
  }
  app.on('second-instance', onSecond)
  return true
}

export function focusWindow(win: BrowserWindow | null | undefined): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
```

- [ ] **Step 2: `windows.ts`**

```ts
// packages/desktop/src/main/windows.ts
import { BrowserWindow } from 'electron'
import { join } from 'node:path'

type MakeOpts = {
  mode: 'agent' | 'viewer' | 'welcome'
  width?: number
  height?: number
  alwaysOnTop?: boolean
}

const PRELOAD_DIR = join(__dirname, '..', 'preload')
const RENDERER_DIR = join(__dirname, '..', 'renderer')

export function makeWindow(opts: MakeOpts): BrowserWindow {
  const preload =
    opts.mode === 'agent' ? join(PRELOAD_DIR, 'agent.js')
    : opts.mode === 'viewer' ? join(PRELOAD_DIR, 'viewer.js')
    : join(PRELOAD_DIR, 'viewer.js') // welcome uses any minimal preload

  const win = new BrowserWindow({
    width: opts.width ?? 980,
    height: opts.height ?? 680,
    backgroundColor: '#0a0a0a',
    alwaysOnTop: opts.alwaysOnTop ?? false,
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const htmlFile =
    opts.mode === 'agent' ? 'agent.html'
    : opts.mode === 'viewer' ? 'viewer.html'
    : 'welcome.html'

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${htmlFile}`)
  } else {
    void win.loadFile(join(RENDERER_DIR, htmlFile))
  }
  return win
}
```

- [ ] **Step 3: Rewrite `src/main/index.ts`**

```ts
// packages/desktop/src/main/index.ts
import { app, BrowserWindow } from 'electron'
import log from 'electron-log/main'
import Store from 'electron-store'
import { resolveMode } from './mode.js'
import { enforceSingleInstance, focusWindow } from './single-instance.js'
import { makeWindow } from './windows.js'
import { QUIT_CLEANUP_TIMEOUT_MS } from '@desk/shared'

log.initialize()

type StoreShape = { mode?: 'agent' | 'viewer' }
const store = new Store<StoreShape>({ name: process.env.APP_MODE ? `dev-${process.env.APP_MODE}` : 'config' })

// In dev, set a per-mode userData dir so two electron instances can coexist.
if (process.env.APP_MODE && !app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-${process.env.APP_MODE}`)
}

let mainWindow: BrowserWindow | null = null

const ok = enforceSingleInstance(() => focusWindow(mainWindow))
if (ok) {
  app.whenReady().then(() => {
    const mode = resolveMode({ stored: store.get('mode') })
    log.info('desktop: starting in mode', mode)
    mainWindow = makeWindow({ mode })
    mainWindow.on('closed', () => { mainWindow = null })
  }).catch((err) => { log.error('startup failed', err); app.quit() })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

  app.on('before-quit', async (e) => {
    e.preventDefault()
    const timeout = new Promise<void>((res) => setTimeout(res, QUIT_CLEANUP_TIMEOUT_MS))
    await Promise.race([cleanup(), timeout])
    app.exit(0)
  })
}

async function cleanup(): Promise<void> {
  // Filled by Agent/Viewer modules; placeholder hooks into a registry later.
  log.info('cleanup placeholder')
}
```

- [ ] **Step 4: Add dev scripts at the repo root `package.json`**

```json
"dev:agent": "cross-env APP_MODE=agent pnpm --filter @desk/desktop dev",
"dev:viewer": "cross-env APP_MODE=viewer pnpm --filter @desk/desktop dev"
```

Install `cross-env` at root:
```bash
pnpm add -D -w cross-env
```

- [ ] **Step 5: Smoke**

Run `pnpm dev:agent` in one terminal, `pnpm dev:viewer` in another. Two windows open; welcome placeholder visible. Close both with Cmd/Ctrl+Q.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/src/main/index.ts packages/desktop/src/main/windows.ts packages/desktop/src/main/single-instance.ts package.json pnpm-lock.yaml
git commit -m "feat(desktop): boot with mode branching, single-instance, clean shutdown"
```

---

### T24: Typed preload bridge + renderer `window.api`

**Implements:** spec §5.2

**Files:**
- Modify: `packages/desktop/src/preload/agent.ts`
- Modify: `packages/desktop/src/preload/viewer.ts`
- Create: `packages/desktop/src/shared/api-types.ts`
- Create: `packages/desktop/src/renderer/shared/api.ts`

- [ ] **Step 1: Shared API types**

```ts
// packages/desktop/src/shared/api-types.ts
import type { MouseMsg, KeyMsg, SignalingMessage } from '@desk/shared'

export type AgentEvent =
  | { type: 'signaling:in'; payload: SignalingMessage }
  | { type: 'session:state'; payload: unknown }   // refined in T30

export type ViewerEvent =
  | { type: 'signaling:in'; payload: SignalingMessage }
  | { type: 'discovery:found'; payload: { name: string; host: string; port: number }[] }

export type AgentApi = {
  mode: 'agent'
  onEvent: (cb: (e: AgentEvent) => void) => () => void
  signalingOut: (m: SignalingMessage) => void
  inputEvent: (m: MouseMsg | KeyMsg) => void
  sessionEnd: (reason?: string) => void
  permissionCheck: () => Promise<{ screen: boolean; a11y: boolean }>
}

export type ViewerApi = {
  mode: 'viewer'
  onEvent: (cb: (e: ViewerEvent) => void) => () => void
  signalingOut: (m: SignalingMessage) => void
  connectionStart: (p: { agentHost: string; port: number; code: string }) => Promise<void>
  sessionEnd: (reason?: string) => void
}

declare global {
  interface Window {
    api: AgentApi | ViewerApi | { mode: 'welcome' }
  }
}
```

- [ ] **Step 2: Preload `agent.ts`**

```ts
// packages/desktop/src/preload/agent.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { AgentApi, AgentEvent } from '../shared/api-types.js'

const api: AgentApi = {
  mode: 'agent',
  onEvent(cb) {
    const handler = (_: unknown, e: AgentEvent) => cb(e)
    ipcRenderer.on('agent:event', handler)
    return () => ipcRenderer.off('agent:event', handler)
  },
  signalingOut: (m) => ipcRenderer.send('signaling:out', m),
  inputEvent: (m) => ipcRenderer.send('input:event', m),
  sessionEnd: (reason) => ipcRenderer.send('session:end', { reason }),
  permissionCheck: () => ipcRenderer.invoke('permission:check'),
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 3: Preload `viewer.ts`**

```ts
// packages/desktop/src/preload/viewer.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ViewerApi, ViewerEvent } from '../shared/api-types.js'

const api: ViewerApi = {
  mode: 'viewer',
  onEvent(cb) {
    const handler = (_: unknown, e: ViewerEvent) => cb(e)
    ipcRenderer.on('viewer:event', handler)
    return () => ipcRenderer.off('viewer:event', handler)
  },
  signalingOut: (m) => ipcRenderer.send('signaling:out', m),
  connectionStart: (p) => ipcRenderer.invoke('connection:start', p),
  sessionEnd: (reason) => ipcRenderer.send('session:end', { reason }),
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 4: Renderer convenience wrapper**

```ts
// packages/desktop/src/renderer/shared/api.ts
import type { AgentApi, ViewerApi } from '../../shared/api-types.js'

export function getAgentApi(): AgentApi {
  const api = window.api
  if (api.mode !== 'agent') throw new Error('expected agent api')
  return api
}
export function getViewerApi(): ViewerApi {
  const api = window.api
  if (api.mode !== 'viewer') throw new Error('expected viewer api')
  return api
}
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/shared/ packages/desktop/src/preload/ packages/desktop/src/renderer/shared/
git commit -m "feat(desktop): typed contextBridge api for agent/viewer"
```

---

### T25: IPC channel constants + main-side handler registry

**Implements:** spec §7.3

**Files:**
- Create: `packages/desktop/src/main/ipc/channels.ts`
- Create: `packages/desktop/src/main/ipc/registry.ts`

- [ ] **Step 1: Channels**

```ts
// packages/desktop/src/main/ipc/channels.ts
export const IPC = {
  AgentEvent: 'agent:event',
  ViewerEvent: 'viewer:event',
  SignalingOut: 'signaling:out',
  InputEvent: 'input:event',
  ConnectionStart: 'connection:start',
  SessionEnd: 'session:end',
  PermissionCheck: 'permission:check',
} as const
```

- [ ] **Step 2: Registry**

```ts
// packages/desktop/src/main/ipc/registry.ts
import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type BrowserWindow } from 'electron'
import { IPC } from './channels.js'
import type { AgentEvent, ViewerEvent } from '../../shared/api-types.js'

type CleanupFn = () => Promise<void> | void
const cleanups: CleanupFn[] = []

export function registerCleanup(fn: CleanupFn): void { cleanups.push(fn) }

export async function runCleanups(): Promise<void> {
  for (const fn of cleanups.splice(0).reverse()) {
    try { await fn() } catch (e) { console.error('cleanup failed', e) }
  }
}

export function pushAgentEvent(win: BrowserWindow | null, e: AgentEvent): void {
  win?.webContents.send(IPC.AgentEvent, e)
}
export function pushViewerEvent(win: BrowserWindow | null, e: ViewerEvent): void {
  win?.webContents.send(IPC.ViewerEvent, e)
}

export function onSend(channel: string, fn: (e: IpcMainEvent, ...args: unknown[]) => void): void {
  ipcMain.on(channel, fn)
}
export function onInvoke(channel: string, fn: (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, fn)
}
```

- [ ] **Step 3: Wire cleanup into bootstrap**

Modify `packages/desktop/src/main/index.ts` `cleanup()` to call `runCleanups`:

```ts
import { runCleanups } from './ipc/registry.js'
// ...
async function cleanup(): Promise<void> {
  await runCleanups()
}
```

- [ ] **Step 4: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/main/ipc/ packages/desktop/src/main/index.ts
git commit -m "feat(desktop/main): ipc channels and cleanup registry"
```

---

### T26: Zustand store wiring + Tailwind verified

**Files:**
- Create: `packages/desktop/src/renderer/shared/log.ts` (renderer log shim)
- Modify: `packages/desktop/src/renderer/welcome/main.tsx` — render real Tailwind

- [ ] **Step 1: log shim**

```ts
// packages/desktop/src/renderer/shared/log.ts
import log from 'electron-log/renderer'
export default log
```

- [ ] **Step 2: Welcome placeholder using Tailwind**

```tsx
// packages/desktop/src/renderer/welcome/main.tsx
import { createRoot } from 'react-dom/client'
import '../styles.css'

createRoot(document.getElementById('root')!).render(
  <main className="h-full flex items-center justify-center">
    <div className="text-center space-y-4">
      <h1 className="text-3xl font-semibold">desk-controller</h1>
      <p className="text-neutral-400">Welcome screen (mode picker arrives in T27).</p>
    </div>
  </main>,
)
```

- [ ] **Step 3: Smoke**

`pnpm dev:agent` — welcome window shows styled text (dark background, white heading).
Close the window.

- [ ] **Step 4: Commit**

```bash
git add packages/desktop/src/renderer/shared/log.ts packages/desktop/src/renderer/welcome/main.tsx
git commit -m "feat(desktop/renderer): tailwind base + log shim"
```

---

### T27: Welcome mode picker

**Files:**
- Create: `packages/desktop/src/renderer/welcome/App.tsx`
- Modify: `packages/desktop/src/renderer/welcome/main.tsx`
- Modify: `packages/desktop/src/main/index.ts` — listen for mode pick
- Create: `packages/desktop/src/main/ipc/welcome.ts`

- [ ] **Step 1: Welcome preload + api types**

Add to `packages/desktop/src/shared/api-types.ts`:
```ts
export type WelcomeApi = {
  mode: 'welcome'
  pickMode: (m: 'agent' | 'viewer') => Promise<void>
}
```

Change the global `window.api` union to include `WelcomeApi`.

Create `packages/desktop/src/preload/welcome.ts`:
```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { WelcomeApi } from '../shared/api-types.js'

const api: WelcomeApi = {
  mode: 'welcome',
  pickMode: (m) => ipcRenderer.invoke('welcome:pick', m),
}
contextBridge.exposeInMainWorld('api', api)
```

Update `electron.vite.config.ts` preload input map:
```ts
preload: { build: { rollupOptions: { input: {
  agent: resolve(__dirname, 'src/preload/agent.ts'),
  viewer: resolve(__dirname, 'src/preload/viewer.ts'),
  welcome: resolve(__dirname, 'src/preload/welcome.ts'),
} } } }
```

Update `windows.ts` welcome branch to load `welcome.js` preload.

- [ ] **Step 2: Welcome App component**

```tsx
// packages/desktop/src/renderer/welcome/App.tsx
import { useState } from 'react'

export function WelcomeApp() {
  const [busy, setBusy] = useState(false)
  const pick = async (m: 'agent' | 'viewer') => {
    setBusy(true)
    const api = window.api
    if (api.mode !== 'welcome') return
    await api.pickMode(m)
  }
  return (
    <main className="h-full flex items-center justify-center">
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-semibold">desk-controller</h1>
        <p className="text-neutral-400">Choose how this instance will run.</p>
        <div className="flex gap-4 justify-center">
          <button disabled={busy} onClick={() => pick('agent')}
            className="px-6 py-3 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
            I want to be controlled (Agent)
          </button>
          <button disabled={busy} onClick={() => pick('viewer')}
            className="px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50">
            I want to control (Viewer)
          </button>
        </div>
      </div>
    </main>
  )
}
```

```tsx
// packages/desktop/src/renderer/welcome/main.tsx
import { createRoot } from 'react-dom/client'
import { WelcomeApp } from './App.js'
import '../styles.css'
createRoot(document.getElementById('root')!).render(<WelcomeApp />)
```

- [ ] **Step 3: Main side — handle pick**

`packages/desktop/src/main/ipc/welcome.ts`:
```ts
import { ipcMain, app, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { makeWindow } from '../windows.js'

type StoreShape = { mode?: 'agent' | 'viewer' }

export function registerWelcomeHandlers(store: Store<StoreShape>, replace: (w: BrowserWindow | null) => void): void {
  ipcMain.handle('welcome:pick', async (e, mode: 'agent' | 'viewer') => {
    store.set('mode', mode)
    const sender = BrowserWindow.fromWebContents(e.sender)
    const next = makeWindow({ mode })
    replace(next)
    sender?.close()
  })
}
```

Wire it in `index.ts` whenReady:
```ts
import { registerWelcomeHandlers } from './ipc/welcome.js'
// inside whenReady, after creating mainWindow:
registerWelcomeHandlers(store, (w) => { mainWindow = w })
```

- [ ] **Step 4: Smoke**

Delete dev userData if needed (`~/Library/Application Support/desktop-agent` etc.) so welcome shows. Launch `pnpm dev:agent` without `APP_MODE` (use a third script `pnpm --filter @desk/desktop dev` directly to avoid env). Click Agent button → window swaps to agent placeholder.

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/ pnpm-lock.yaml
git commit -m "feat(desktop): welcome screen with mode pick persisted to store"
```

---

### T28: Permission probe helpers

**Implements:** spec §10 (permission rows)

**Files:**
- Create: `packages/desktop/src/main/agent/permissions.ts`

- [ ] **Step 1: Implement (macOS uses `systemPreferences`, Windows returns true)**

```ts
// packages/desktop/src/main/agent/permissions.ts
import { systemPreferences } from 'electron'

export type Perms = { screen: boolean; a11y: boolean }

export function checkPermissions(): Perms {
  if (process.platform !== 'darwin') return { screen: true, a11y: true }
  const screen = systemPreferences.getMediaAccessStatus('screen') === 'granted'
  const a11y = systemPreferences.isTrustedAccessibilityClient(false)
  return { screen, a11y }
}

export function promptA11y(): void {
  if (process.platform === 'darwin') systemPreferences.isTrustedAccessibilityClient(true)
}
```

- [ ] **Step 2: Wire IPC handler (only when mode === 'agent')**

In `main/index.ts`, when mode is `agent`, register:
```ts
import { ipcMain } from 'electron'
import { checkPermissions } from './agent/permissions.js'
ipcMain.handle('permission:check', () => checkPermissions())
```

- [ ] **Step 3: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/main/agent/permissions.ts packages/desktop/src/main/index.ts
git commit -m "feat(desktop/agent): permission probe (macOS screen + a11y)"
```

---

## Phase 4 — Agent role

### T29: Re-use `PairStore` in Agent main (no new code — verify wiring shape)

**Note:** `PairStore` lives in `@desk/shared` (T14). No new code; this task is a placeholder for documentation referenced by T30. Skip to T30 directly. *(Counted to keep numbering stable.)*

---

### T30: Agent session state machine

**Implements:** spec §8.1

**Files:**
- Create: `packages/desktop/src/main/agent/session-state.ts`
- Create: `packages/desktop/tests/agent-session-state.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/desktop/tests/agent-session-state.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AgentSession } from '../src/main/agent/session-state.js'
import { PairStore, ErrorCode } from '@desk/shared'

describe('AgentSession', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01')) })

  it('starts in pairing phase with code', () => {
    const s = new AgentSession(new PairStore())
    expect(s.state.phase).toBe('pairing')
    if (s.state.phase === 'pairing') expect(s.state.code).toHaveLength(6)
  })

  it('rejects wrong code (stays pairing, attempts++)', () => {
    const s = new AgentSession(new PairStore())
    const r = s.tryPair('NOPE12', 'viewer-1')
    expect(r).toEqual({ ok: false, reason: ErrorCode.E_PAIR_INVALID_CODE })
    expect(s.state.phase).toBe('pairing')
  })

  it('accepts right code and moves to connecting', () => {
    const pair = new PairStore()
    const s = new AgentSession(pair)
    const code = pair.snapshot().code
    const r = s.tryPair(code, 'viewer-1')
    expect(r.ok).toBe(true)
    expect(s.state.phase).toBe('connecting')
  })

  it('connecting → active on peerConnected', () => {
    const pair = new PairStore()
    const s = new AgentSession(pair)
    s.tryPair(pair.snapshot().code, 'v')
    s.peerConnected()
    expect(s.state.phase).toBe('active')
  })

  it('rejects pair while busy (peer-busy)', () => {
    const pair = new PairStore()
    const s = new AgentSession(pair)
    s.tryPair(pair.snapshot().code, 'v1')
    s.peerConnected()
    const r = s.tryPair(pair.snapshot().code, 'v2')
    expect(r).toEqual({ ok: false, reason: ErrorCode.E_PEER_BUSY })
  })

  it('active → disconnecting → pairing on disconnect', () => {
    const pair = new PairStore()
    const s = new AgentSession(pair)
    s.tryPair(pair.snapshot().code, 'v')
    s.peerConnected()
    s.disconnect('viewer-bye')
    expect(s.state.phase).toBe('disconnecting')
    s.cleanupComplete()
    expect(s.state.phase).toBe('pairing')
  })

  it('connecting → pairing on ICE failed', () => {
    const pair = new PairStore()
    const s = new AgentSession(pair)
    s.tryPair(pair.snapshot().code, 'v')
    s.iceFailed()
    expect(s.state.phase).toBe('disconnecting')
    s.cleanupComplete()
    expect(s.state.phase).toBe('pairing')
  })

  it('emits state change events', () => {
    const seen: string[] = []
    const s = new AgentSession(new PairStore())
    s.onChange((st) => seen.push(st.phase))
    s.tryPair('WRONG1', 'v')
    expect(seen).not.toContain('connecting')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/desktop/src/main/agent/session-state.ts
import { PairStore, ErrorCode, type VerifyResult } from '@desk/shared'

export type AgentPhase = 'pairing' | 'connecting' | 'active' | 'disconnecting'

export type AgentSessionState =
  | { phase: 'pairing'; code: string; expiresAt: number; attempts: number; lockedUntil?: number }
  | { phase: 'connecting'; viewerId: string }
  | { phase: 'active'; viewerId: string; since: number }
  | { phase: 'disconnecting'; reason: string }

export class AgentSession {
  private current: AgentSessionState
  private listeners = new Set<(s: AgentSessionState) => void>()

  constructor(private readonly pair: PairStore) {
    this.current = this.pairingState()
  }

  get state(): AgentSessionState { return this.current }

  onChange(l: (s: AgentSessionState) => void): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  tryPair(input: string, viewerId: string): VerifyResult {
    if (this.current.phase === 'active' || this.current.phase === 'connecting') {
      return { ok: false, reason: ErrorCode.E_PEER_BUSY }
    }
    const r = this.pair.verify(input)
    if (!r.ok) {
      this.set(this.pairingState())
      return r
    }
    this.set({ phase: 'connecting', viewerId })
    return { ok: true }
  }

  peerConnected(): void {
    if (this.current.phase !== 'connecting') return
    this.set({ phase: 'active', viewerId: this.current.viewerId, since: Date.now() })
  }

  iceFailed(): void { this.disconnect('ice-failed') }

  disconnect(reason: string): void {
    if (this.current.phase === 'disconnecting' || this.current.phase === 'pairing') return
    this.set({ phase: 'disconnecting', reason })
  }

  cleanupComplete(): void {
    this.set(this.pairingState())
  }

  private pairingState(): AgentSessionState {
    const snap = this.pair.snapshot()
    return {
      phase: 'pairing',
      code: snap.code,
      expiresAt: snap.expiresAt,
      attempts: snap.attempts,
      ...(snap.lockedUntil !== undefined ? { lockedUntil: snap.lockedUntil } : {}),
    }
  }

  private set(s: AgentSessionState): void {
    this.current = s
    for (const l of this.listeners) l(s)
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter @desk/desktop test
git add packages/desktop/src/main/agent/session-state.ts packages/desktop/tests/agent-session-state.test.ts
git commit -m "feat(desktop/agent): session state machine"
```

---

### T31: Signaling-server integration in Agent main

**Implements:** spec §6.3, §6.4

**Files:**
- Create: `packages/desktop/src/main/agent/signaling-host.ts`

- [ ] **Step 1: Implement (no test — relies on @desk/signaling already tested)**

```ts
// packages/desktop/src/main/agent/signaling-host.ts
import { EmbeddedServerTransport } from '@desk/signaling'
import type { SignalingMessage } from '@desk/shared'
import { registerCleanup } from '../ipc/registry.js'
import log from 'electron-log/main'

export async function startSignalingHost(): Promise<EmbeddedServerTransport> {
  const transport = new EmbeddedServerTransport({ host: '0.0.0.0', port: 0 })
  await transport.start()
  log.info('signaling: listening on', transport.port)
  registerCleanup(async () => { await transport.stop() })
  return transport
}

export type AgentSignalingBus = {
  port: number
  onIn: (h: (m: SignalingMessage) => void) => () => void
  send: (m: SignalingMessage) => void
  onState: (h: (s: 'open' | 'closed' | 'error') => void) => () => void
}

export function adapt(transport: EmbeddedServerTransport): AgentSignalingBus {
  return {
    port: transport.port,
    onIn: (h) => transport.onMessage(h),
    send: (m) => transport.send(m),
    onState: (h) => transport.onConnectionState(h),
  }
}
```

- [ ] **Step 2: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/main/agent/signaling-host.ts
git commit -m "feat(desktop/agent): embed signaling ws server"
```

---

### T32: mDNS broadcast

**Files:**
- Create: `packages/desktop/src/main/agent/mdns-broadcast.ts`

- [ ] **Step 1: Implement**

```ts
// packages/desktop/src/main/agent/mdns-broadcast.ts
import { Bonjour } from 'bonjour-service'
import { MDNS_SERVICE_TYPE } from '@desk/shared'
import { hostname } from 'node:os'
import { registerCleanup } from '../ipc/registry.js'
import log from 'electron-log/main'

export function startBroadcast(port: number): void {
  const bonjour = new Bonjour()
  const service = bonjour.publish({
    name: hostname(),
    type: MDNS_SERVICE_TYPE,
    protocol: 'tcp',
    port,
  })
  log.info('mdns: broadcast as', hostname(), '@', port)
  registerCleanup(async () => {
    await new Promise<void>((res) => service.stop(() => res()))
    bonjour.destroy()
  })
}
```

- [ ] **Step 2: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/main/agent/mdns-broadcast.ts
git commit -m "feat(desktop/agent): mDNS broadcast via bonjour-service"
```

---

### T33: nut-js input injector wrapper

**Implements:** spec §6.2, §9.6

**Files:**
- Create: `packages/desktop/src/main/agent/input-injector.ts`

- [ ] **Step 1: Implement**

```ts
// packages/desktop/src/main/agent/input-injector.ts
import { mouse, keyboard, Button, Point, Key } from '@nut-tree-fork/nut-js'
import { screen as electronScreen } from 'electron'
import {
  type MouseMsg, type KeyMsg, normalizedToScreen, clamp01, decodeMods,
} from '@desk/shared'
import log from 'electron-log/main'

mouse.config.mouseSpeed = 99999  // effectively immediate
mouse.config.autoDelayMs = 0
keyboard.config.autoDelayMs = 0

const pressedKeys = new Set<string>()

function display(): { width: number; height: number } {
  const d = electronScreen.getPrimaryDisplay().size
  return { width: d.width, height: d.height }
}

const buttonMap: Record<0 | 1 | 2, Button> = {
  0: Button.LEFT,
  1: Button.MIDDLE,
  2: Button.RIGHT,
}

export async function handleMouse(msg: MouseMsg): Promise<void> {
  const size = display()
  const x = clamp01(msg.x), y = clamp01(msg.y)
  const { x: px, y: py } = normalizedToScreen({ x, y }, size)
  switch (msg.t) {
    case 'mm':
      await mouse.setPosition(new Point(px, py))
      return
    case 'md':
      await mouse.setPosition(new Point(px, py))
      await mouse.pressButton(buttonMap[msg.b])
      return
    case 'mu':
      await mouse.setPosition(new Point(px, py))
      await mouse.releaseButton(buttonMap[msg.b])
      return
    case 'mw':
      await mouse.setPosition(new Point(px, py))
      if (msg.dy !== 0) await (msg.dy > 0 ? mouse.scrollDown(msg.dy) : mouse.scrollUp(-msg.dy))
      if (msg.dx !== 0) await (msg.dx > 0 ? mouse.scrollRight(msg.dx) : mouse.scrollLeft(-msg.dx))
      return
  }
}

export async function handleKey(msg: KeyMsg): Promise<void> {
  switch (msg.t) {
    case 'kd': {
      const key = mapCode(msg.code)
      if (!key) return
      pressedKeys.add(msg.code)
      await keyboard.pressKey(...withMods(key, msg.mods))
      return
    }
    case 'ku': {
      const key = mapCode(msg.code)
      if (!key) return
      pressedKeys.delete(msg.code)
      await keyboard.releaseKey(...withMods(key, msg.mods))
      return
    }
    case 'sync': {
      const viewerKeys = new Set(msg.keys)
      for (const k of [...pressedKeys]) {
        if (!viewerKeys.has(k)) {
          const key = mapCode(k)
          if (key) await keyboard.releaseKey(key)
          pressedKeys.delete(k)
        }
      }
      return
    }
    case 'rk':
      await releaseAll()
      return
  }
}

export async function releaseAll(): Promise<void> {
  for (const k of [...pressedKeys]) {
    const key = mapCode(k)
    if (key) try { await keyboard.releaseKey(key) } catch (e) { log.warn('releaseKey failed', e) }
  }
  pressedKeys.clear()
}

function withMods(key: Key, modsBitmap: number): Key[] {
  const m = decodeMods(modsBitmap)
  const out: Key[] = []
  if (m.shift) out.push(Key.LeftShift)
  if (m.ctrl) out.push(Key.LeftControl)
  if (m.alt) out.push(Key.LeftAlt)
  if (m.meta) out.push(Key.LeftSuper)
  out.push(key)
  return out
}

/**
 * Map a `KeyboardEvent.code` string to a nut-js Key. This is the minimum useful subset for M1.
 * Unknown codes return undefined (silently dropped — IME composition is filtered at viewer side).
 */
function mapCode(code: string): Key | undefined {
  if (code.startsWith('Key') && code.length === 4) {
    const k = code.slice(3) as keyof typeof Key
    return Key[k]
  }
  if (code.startsWith('Digit') && code.length === 6) {
    const k = `Num${code.slice(5)}` as keyof typeof Key
    return Key[k]
  }
  const direct: Record<string, Key> = {
    Enter: Key.Enter, Tab: Key.Tab, Space: Key.Space, Backspace: Key.Backspace,
    Escape: Key.Escape, ArrowUp: Key.Up, ArrowDown: Key.Down,
    ArrowLeft: Key.Left, ArrowRight: Key.Right,
    ShiftLeft: Key.LeftShift, ShiftRight: Key.RightShift,
    ControlLeft: Key.LeftControl, ControlRight: Key.RightControl,
    AltLeft: Key.LeftAlt, AltRight: Key.RightAlt,
    MetaLeft: Key.LeftSuper, MetaRight: Key.RightSuper,
    CapsLock: Key.CapsLock, Delete: Key.Delete, Home: Key.Home, End: Key.End,
    PageUp: Key.PageUp, PageDown: Key.PageDown,
    Comma: Key.Comma, Period: Key.Period, Slash: Key.Slash,
    Semicolon: Key.Semicolon, Quote: Key.Quote,
    BracketLeft: Key.LeftBracket, BracketRight: Key.RightBracket,
    Backslash: Key.Backslash, Backquote: Key.Grave, Minus: Key.Minus, Equal: Key.Equal,
  }
  return direct[code]
}
```

- [ ] **Step 2: Manual smoke**

Write a tiny scratch script (don't commit) that imports `handleMouse` and verifies a mouse move/click against the user's own desktop. After verifying, delete the scratch.

- [ ] **Step 3: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/main/agent/input-injector.ts
git commit -m "feat(desktop/agent): nut-js input injector with key code mapping"
```

---

### T34: Wire Agent main: signaling + state machine + permissions + cleanup

**Files:**
- Create: `packages/desktop/src/main/agent/bootstrap.ts`
- Modify: `packages/desktop/src/main/index.ts`

- [ ] **Step 1: `bootstrap.ts`**

```ts
// packages/desktop/src/main/agent/bootstrap.ts
import { BrowserWindow } from 'electron'
import { PairStore, ErrorCode, type SignalingMessage } from '@desk/shared'
import { AgentSession } from './session-state.js'
import { startSignalingHost, adapt } from './signaling-host.js'
import { startBroadcast } from './mdns-broadcast.js'
import { checkPermissions } from './permissions.js'
import { handleKey, handleMouse, releaseAll } from './input-injector.js'
import { IPC } from '../ipc/channels.js'
import { onSend, onInvoke, pushAgentEvent, registerCleanup } from '../ipc/registry.js'
import log from 'electron-log/main'

export async function bootstrapAgent(getWin: () => BrowserWindow | null): Promise<void> {
  const pair = new PairStore()
  const session = new AgentSession(pair)
  const transport = await startSignalingHost()
  const bus = adapt(transport)
  startBroadcast(bus.port)

  const sendOut = (m: SignalingMessage) => bus.send(m)

  session.onChange((state) => pushAgentEvent(getWin(), { type: 'session:state', payload: state }))

  bus.onIn((msg) => {
    pushAgentEvent(getWin(), { type: 'signaling:in', payload: msg })
    if (msg.t === 'pair-request') {
      const result = session.tryPair(msg.code, 'viewer')
      sendOut({ v: 1, t: 'pair-result', ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) })
    } else if (msg.t === 'bye') {
      session.disconnect('viewer-bye')
    } else if (msg.t === 'ping') {
      sendOut({ v: 1, t: 'pong' })
    }
  })

  bus.onState((s) => {
    if (s === 'closed') {
      session.disconnect('signaling-closed')
    }
  })

  onSend(IPC.SignalingOut, (_e, ...args: unknown[]) => sendOut(args[0] as SignalingMessage))
  onSend(IPC.InputEvent, (_e, ...args: unknown[]) => {
    const m = args[0] as { t: string }
    if (m.t === 'kd' || m.t === 'ku' || m.t === 'sync' || m.t === 'rk') {
      void handleKey(m as never)
    } else {
      void handleMouse(m as never)
    }
  })
  onSend(IPC.SessionEnd, () => session.disconnect('local-end'))
  onInvoke(IPC.PermissionCheck, () => checkPermissions())

  registerCleanup(async () => {
    try { await releaseAll() } catch (e) { log.error('releaseAll failed', e) }
    sendOut({ v: 1, t: 'bye', reason: 'agent-quit' })
  })
}
```

- [ ] **Step 2: Hook into `main/index.ts`**

```ts
import { bootstrapAgent } from './agent/bootstrap.js'
// inside whenReady(), after `mainWindow = makeWindow({ mode })`:
if (mode === 'agent') {
  await bootstrapAgent(() => mainWindow)
}
```

- [ ] **Step 3: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/main/agent/bootstrap.ts packages/desktop/src/main/index.ts
git commit -m "feat(desktop/agent): bootstrap wires signaling/state/input/perms"
```

---

### T35: Agent renderer — desktop capture

**Implements:** spec §6.1

**Files:**
- Create: `packages/desktop/src/renderer/agent/capture.ts`

- [ ] **Step 1: Implement**

```ts
// packages/desktop/src/renderer/agent/capture.ts
import { VIDEO_MAX_FRAMERATE } from '@desk/shared'

export async function captureScreen(): Promise<MediaStream> {
  // Electron exposes desktopCapturer through getUserMedia with chromeMediaSource
  // The actual selection is handled by the displayMediaSourceId; null = default.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      // @ts-expect-error chromeMediaSource is a non-standard Electron extension
      mandatory: {
        chromeMediaSource: 'desktop',
        minFrameRate: 30,
        maxFrameRate: VIDEO_MAX_FRAMERATE,
      },
    },
  })
  for (const track of stream.getVideoTracks()) track.contentHint = 'detail'
  return stream
}
```

- [ ] **Step 2: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/renderer/agent/capture.ts
git commit -m "feat(desktop/agent): screen capture stream"
```

---

### T36: SDP munging + RTCRtpSender tuning

**Implements:** spec §9.3

**Files:**
- Create: `packages/desktop/src/renderer/shared/webrtc/sdp-munge.ts`
- Create: `packages/desktop/src/renderer/shared/webrtc/sender-params.ts`
- Create: `packages/desktop/tests/sdp-munge.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/desktop/tests/sdp-munge.test.ts
import { describe, expect, it } from 'vitest'
import { preferCodec } from '../src/renderer/shared/webrtc/sdp-munge.js'

const SAMPLE_SDP = `v=0
o=- 0 0 IN IP4 0.0.0.0
s=-
t=0 0
m=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99
a=rtpmap:96 VP8/90000
a=rtpmap:97 rtx/90000
a=fmtp:97 apt=96
a=rtpmap:98 H264/90000
a=fmtp:98 level-asymmetry-allowed=1;packetization-mode=1
a=rtpmap:99 rtx/90000
a=fmtp:99 apt=98
`

describe('preferCodec', () => {
  it('moves H264 payloads to front of m=video', () => {
    const out = preferCodec(SAMPLE_SDP, 'H264')
    const mline = out.split('\n').find((l) => l.startsWith('m=video'))!
    expect(mline).toMatch(/^m=video 9 UDP\/TLS\/RTP\/SAVPF 98 99 96 97/)
  })
  it('returns input unchanged if codec missing', () => {
    expect(preferCodec(SAMPLE_SDP, 'AV1')).toBe(SAMPLE_SDP)
  })
})
```

Vitest renderer test needs jsdom — update `packages/desktop/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    environmentMatchGlobs: [['tests/sdp-munge.test.ts', 'node']],
  },
})
```

(`preferCodec` is pure string work — keep environment `node`.)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/desktop/src/renderer/shared/webrtc/sdp-munge.ts
export function preferCodec(sdp: string, codec: 'H264' | 'VP9' | 'VP8'): string {
  const lines = sdp.split(/\r?\n/)
  const videoIdx = lines.findIndex((l) => l.startsWith('m=video '))
  if (videoIdx < 0) return sdp
  const rtpmapRe = new RegExp(`^a=rtpmap:(\\d+) ${codec}/`, 'i')
  const matching = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => rtpmapRe.test(l))
    .map(({ l }) => l.match(/^a=rtpmap:(\d+)/)![1]!)

  if (matching.length === 0) return sdp

  // Also include rtx (retransmission) payload types whose apt= matches.
  const rtxPts: string[] = []
  for (const pt of matching) {
    const aptIdx = lines.findIndex((l) => new RegExp(`^a=fmtp:(\\d+) apt=${pt}\\b`).test(l))
    if (aptIdx >= 0) {
      const m = lines[aptIdx]!.match(/^a=fmtp:(\d+)/)
      if (m) rtxPts.push(m[1]!)
    }
  }
  const preferred = [...matching, ...rtxPts]

  const m = lines[videoIdx]!.split(' ')
  const header = m.slice(0, 3)
  const pts = m.slice(3)
  const rest = pts.filter((p) => !preferred.includes(p))
  lines[videoIdx] = [...header, ...preferred, ...rest].join(' ')
  return lines.join('\r\n')
}
```

- [ ] **Step 4: Sender params helper**

```ts
// packages/desktop/src/renderer/shared/webrtc/sender-params.ts
import { VIDEO_MAX_BITRATE_BPS, VIDEO_MAX_FRAMERATE } from '@desk/shared'

export async function tuneVideoSender(sender: RTCRtpSender): Promise<void> {
  const params = sender.getParameters()
  params.encodings = params.encodings.length
    ? params.encodings
    : [{}]
  for (const enc of params.encodings) {
    enc.maxBitrate = VIDEO_MAX_BITRATE_BPS
    enc.maxFramerate = VIDEO_MAX_FRAMERATE
  }
  params.degradationPreference = 'maintain-resolution'
  await sender.setParameters(params)
}
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm --filter @desk/desktop test
git add packages/desktop/src/renderer/shared/webrtc/ packages/desktop/tests/sdp-munge.test.ts packages/desktop/vitest.config.ts
git commit -m "feat(desktop/renderer): sdp codec preference + sender tuning"
```

---

### T37: Agent renderer — PC controller (offerer) + DC input forwarder

**Implements:** spec §6.4 (Agent side)

**Files:**
- Create: `packages/desktop/src/renderer/agent/pc-controller.ts`
- Create: `packages/desktop/src/renderer/agent/store.ts`

- [ ] **Step 1: Store**

```ts
// packages/desktop/src/renderer/agent/store.ts
import { create } from 'zustand'
import type { AgentSessionState } from '../../main/agent/session-state.js'

type S = {
  session: AgentSessionState | null
  setSession: (s: AgentSessionState) => void
}
export const useAgentStore = create<S>((set) => ({
  session: null,
  setSession: (s) => set({ session: s }),
}))
```

- [ ] **Step 2: PC controller**

```ts
// packages/desktop/src/renderer/agent/pc-controller.ts
import { getAgentApi } from '../shared/api.js'
import { captureScreen } from './capture.js'
import { preferCodec } from '../shared/webrtc/sdp-munge.js'
import { tuneVideoSender } from '../shared/webrtc/sender-params.js'
import { DC_KEYBOARD_LABEL, DC_MOUSE_LABEL, type MouseMsg, type KeyMsg } from '@desk/shared'

let pc: RTCPeerConnection | null = null

export async function startOffer(): Promise<void> {
  if (pc) await close()
  const api = getAgentApi()
  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })

  const stream = await captureScreen()
  for (const track of stream.getVideoTracks()) pc.addTrack(track, stream)

  const mouseDc = pc.createDataChannel(DC_MOUSE_LABEL, { ordered: false, maxRetransmits: 0 })
  const keyDc = pc.createDataChannel(DC_KEYBOARD_LABEL, { ordered: true })

  for (const dc of [mouseDc, keyDc]) {
    dc.binaryType = 'arraybuffer'
    dc.onmessage = (ev) => {
      try {
        const m = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data)) as MouseMsg | KeyMsg
        api.inputEvent(m)
      } catch { /* drop */ }
    }
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) api.signalingOut({ v: 1, t: 'ice', candidate: e.candidate.toJSON() })
  }
  pc.onconnectionstatechange = () => {
    if (!pc) return
    if (pc.connectionState === 'failed') api.sessionEnd('ice-failed')
  }

  const offer = await pc.createOffer()
  offer.sdp = preferCodec(offer.sdp!, 'H264')
  await pc.setLocalDescription(offer)
  api.signalingOut({ v: 1, t: 'offer', sdp: offer.sdp! })

  const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
  if (sender) await tuneVideoSender(sender)
}

export async function applyAnswer(sdp: string): Promise<void> {
  if (!pc) return
  await pc.setRemoteDescription({ type: 'answer', sdp })
}

export async function addRemoteIce(candidate: RTCIceCandidateInit): Promise<void> {
  if (!pc) return
  try { await pc.addIceCandidate(candidate) } catch { /* ignore */ }
}

export async function close(): Promise<void> {
  pc?.getSenders().forEach((s) => s.track?.stop())
  pc?.close()
  pc = null
}
```

- [ ] **Step 3: Renderer entry**

`packages/desktop/src/renderer/agent/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import { AgentApp } from './App.js'
import '../styles.css'
createRoot(document.getElementById('root')!).render(<AgentApp />)
```

(`App` is built in T38.)

- [ ] **Step 4: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/renderer/agent/store.ts packages/desktop/src/renderer/agent/pc-controller.ts packages/desktop/src/renderer/agent/main.tsx
git commit -m "feat(desktop/agent): PC controller (offerer) + input DC forwarder"
```

---

### T38: Agent UI — main window

**Implements:** spec §12.1

**Files:**
- Create: `packages/desktop/src/renderer/agent/App.tsx`
- Create: `packages/desktop/src/renderer/agent/components/StatusBadge.tsx`

- [ ] **Step 1: Components**

```tsx
// packages/desktop/src/renderer/agent/components/StatusBadge.tsx
type Props = { phase: string }
export function StatusBadge({ phase }: Props) {
  const color =
    phase === 'active' ? 'bg-red-600'
    : phase === 'pairing' ? 'bg-emerald-600'
    : 'bg-amber-600'
  return <span className={`px-2 py-1 rounded text-xs ${color}`}>{phase}</span>
}
```

```tsx
// packages/desktop/src/renderer/agent/App.tsx
import { useEffect } from 'react'
import { getAgentApi } from '../shared/api.js'
import { useAgentStore } from './store.js'
import { StatusBadge } from './components/StatusBadge.js'
import { startOffer, applyAnswer, addRemoteIce, close } from './pc-controller.js'

export function AgentApp() {
  const api = getAgentApi()
  const session = useAgentStore((s) => s.session)
  const setSession = useAgentStore((s) => s.setSession)

  useEffect(() => {
    const unsub = api.onEvent((e) => {
      if (e.type === 'session:state') {
        const s = e.payload as { phase: string }
        setSession(e.payload as never)
        if (s.phase === 'connecting') void startOffer()
        if (s.phase === 'disconnecting') void close()
      } else if (e.type === 'signaling:in') {
        const m = e.payload
        if (m.t === 'answer') void applyAnswer(m.sdp)
        else if (m.t === 'ice') void addRemoteIce(m.candidate)
      }
    })
    return () => { unsub() }
  }, [api, setSession])

  const phase = session?.phase ?? 'pairing'
  const code = session?.phase === 'pairing' ? session.code : '—'
  const expiresAt = session?.phase === 'pairing' ? session.expiresAt : null

  return (
    <main className="h-full p-8 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">desk-controller · Agent</h1>
        <StatusBadge phase={phase} />
      </header>
      <section className="rounded bg-neutral-900 p-6">
        <div className="text-neutral-400 text-sm">Pair code</div>
        <div className="text-5xl tracking-widest font-mono mt-2">{code}</div>
        {expiresAt && (
          <div className="text-neutral-500 text-xs mt-2">
            rotates at {new Date(expiresAt).toLocaleTimeString()}
          </div>
        )}
      </section>
      <button
        onClick={() => api.sessionEnd('user')}
        disabled={phase !== 'active'}
        className="self-start px-4 py-2 rounded bg-red-700 hover:bg-red-600 disabled:opacity-40">
        Disconnect
      </button>
    </main>
  )
}
```

- [ ] **Step 2: Smoke**

`pnpm dev:agent` → window shows the 6-char code with green pairing badge.

- [ ] **Step 3: Commit**

```bash
git add packages/desktop/src/renderer/agent/
git commit -m "feat(desktop/agent): main UI with pair code and status"
```

---

### T39: Agent HUD overlay window

**Implements:** spec §12.1 (HUD)

**Files:**
- Modify: `packages/desktop/src/main/windows.ts` (add `makeHudWindow`)
- Modify: `packages/desktop/src/main/agent/bootstrap.ts` (open/close on state change)
- Create: `packages/desktop/src/renderer/agent/hud.html`
- Create: `packages/desktop/src/renderer/agent/hud/main.tsx`

- [ ] **Step 1: HUD factory**

Append to `windows.ts`:
```ts
export function makeHudWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 220, height: 56, frame: false, resizable: false,
    alwaysOnTop: true, transparent: true, skipTaskbar: true,
    webPreferences: {
      preload: join(PRELOAD_DIR, 'agent.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/hud.html`)
  } else {
    void win.loadFile(join(RENDERER_DIR, 'hud.html'))
  }
  win.setAlwaysOnTop(true, 'screen-saver')
  return win
}
```

Register `hud` in `electron.vite.config.ts` renderer inputs.

- [ ] **Step 2: HUD html + entry**

`packages/desktop/src/renderer/agent/hud.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8" /><title>HUD</title></head>
<body><div id="root"></div><script type="module" src="/agent/hud/main.tsx"></script></body></html>
```

`packages/desktop/src/renderer/agent/hud/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { getAgentApi } from '../../shared/api.js'
import '../../styles.css'

function Hud() {
  const api = getAgentApi()
  const [phase, setPhase] = useState<string>('?')
  useEffect(() => api.onEvent((e) => {
    if (e.type === 'session:state') setPhase((e.payload as { phase: string }).phase)
  }), [api])
  return (
    <div className="bg-red-700/90 text-white px-3 py-2 rounded flex items-center justify-between h-full">
      <span>● being controlled ({phase})</span>
      <button onClick={() => api.sessionEnd('hud')} className="bg-white/20 px-2 py-1 rounded">Stop</button>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<Hud />)
```

- [ ] **Step 3: Open/close HUD on phase change**

In `bootstrap.ts`, after `session.onChange(...)`, add:
```ts
import { makeHudWindow } from '../windows.js'
let hud: BrowserWindow | null = null
session.onChange((state) => {
  if (state.phase === 'active' && !hud) hud = makeHudWindow()
  if (state.phase === 'pairing' && hud) { hud.close(); hud = null }
})
```

(Add `BrowserWindow` import.)

- [ ] **Step 4: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/
git commit -m "feat(desktop/agent): HUD overlay window during active sessions"
```

---

## Phase 5 — Viewer role

### T40: Viewer mDNS browse

**Implements:** spec §12.2 (discovery)

**Files:**
- Create: `packages/desktop/src/main/viewer/mdns-browse.ts`

- [ ] **Step 1: Implement**

```ts
// packages/desktop/src/main/viewer/mdns-browse.ts
import { Bonjour, type Browser } from 'bonjour-service'
import { MDNS_SERVICE_TYPE } from '@desk/shared'
import { registerCleanup } from '../ipc/registry.js'

export type Found = { name: string; host: string; port: number }

export function browse(onChange: (list: Found[]) => void): void {
  const bonjour = new Bonjour()
  const list = new Map<string, Found>()
  const emit = () => onChange([...list.values()])

  const browser: Browser = bonjour.find({ type: MDNS_SERVICE_TYPE, protocol: 'tcp' })
  browser.on('up', (svc) => {
    const host = svc.referer?.address ?? svc.host
    list.set(svc.fqdn, { name: svc.name, host, port: svc.port })
    emit()
  })
  browser.on('down', (svc) => { list.delete(svc.fqdn); emit() })
  browser.start()
  registerCleanup(() => { browser.stop(); bonjour.destroy() })
}
```

- [ ] **Step 2: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/main/viewer/mdns-browse.ts
git commit -m "feat(desktop/viewer): mDNS browser"
```

---

### T41: Viewer signaling client + bootstrap

**Implements:** spec §6.3, §6.4

**Files:**
- Create: `packages/desktop/src/main/viewer/bootstrap.ts`
- Modify: `packages/desktop/src/main/index.ts`

- [ ] **Step 1: Bootstrap**

```ts
// packages/desktop/src/main/viewer/bootstrap.ts
import { BrowserWindow } from 'electron'
import { EmbeddedClientTransport } from '@desk/signaling'
import type { SignalingMessage } from '@desk/shared'
import { browse } from './mdns-browse.js'
import { IPC } from '../ipc/channels.js'
import { onInvoke, onSend, pushViewerEvent, registerCleanup } from '../ipc/registry.js'

let client: EmbeddedClientTransport | null = null

export function bootstrapViewer(getWin: () => BrowserWindow | null): void {
  browse((list) => pushViewerEvent(getWin(), { type: 'discovery:found', payload: list }))

  onInvoke(IPC.ConnectionStart, async (_e, ...args: unknown[]) => {
    const p = args[0] as { agentHost: string; port: number; code: string }
    if (client) await client.stop()
    client = new EmbeddedClientTransport({ host: p.agentHost, port: p.port })
    client.onMessage((m) => pushViewerEvent(getWin(), { type: 'signaling:in', payload: m }))
    client.onConnectionState((s) => {
      if (s === 'closed') pushViewerEvent(getWin(), { type: 'signaling:in', payload: { v: 1, t: 'bye' } })
    })
    await client.start()
    client.send({ v: 1, t: 'hello', role: 'viewer', clientId: Math.random().toString(36).slice(2) })
    client.send({ v: 1, t: 'pair-request', code: p.code })
  })

  onSend(IPC.SignalingOut, (_e, ...args: unknown[]) => client?.send(args[0] as SignalingMessage))
  onSend(IPC.SessionEnd, () => { void client?.stop(); client = null })

  registerCleanup(async () => { if (client) { client.send({ v: 1, t: 'bye' }); await client.stop() } })
}
```

- [ ] **Step 2: Hook into `main/index.ts`**

```ts
import { bootstrapViewer } from './viewer/bootstrap.js'
// inside whenReady:
if (mode === 'viewer') bootstrapViewer(() => mainWindow)
```

- [ ] **Step 3: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/main/viewer/bootstrap.ts packages/desktop/src/main/index.ts
git commit -m "feat(desktop/viewer): bootstrap with discovery + signaling client"
```

---

### T42: Viewer renderer — PC controller (answerer)

**Files:**
- Create: `packages/desktop/src/renderer/viewer/pc-controller.ts`
- Create: `packages/desktop/src/renderer/viewer/store.ts`

- [ ] **Step 1: Store**

```ts
// packages/desktop/src/renderer/viewer/store.ts
import { create } from 'zustand'

type S = {
  agents: { name: string; host: string; port: number }[]
  stream: MediaStream | null
  mouseDc: RTCDataChannel | null
  keyDc: RTCDataChannel | null
  phase: 'idle' | 'discovering' | 'pairing' | 'negotiating' | 'streaming' | 'failed'
  setAgents: (a: S['agents']) => void
  setStream: (s: MediaStream | null) => void
  setDc: (mouse: RTCDataChannel | null, key: RTCDataChannel | null) => void
  setPhase: (p: S['phase']) => void
}
export const useViewerStore = create<S>((set) => ({
  agents: [],
  stream: null,
  mouseDc: null,
  keyDc: null,
  phase: 'idle',
  setAgents: (agents) => set({ agents }),
  setStream: (stream) => set({ stream }),
  setDc: (mouseDc, keyDc) => set({ mouseDc, keyDc }),
  setPhase: (phase) => set({ phase }),
}))
```

- [ ] **Step 2: PC controller**

```ts
// packages/desktop/src/renderer/viewer/pc-controller.ts
import { useViewerStore } from './store.js'
import { getViewerApi } from '../shared/api.js'
import { DC_KEYBOARD_LABEL, DC_MOUSE_LABEL } from '@desk/shared'

let pc: RTCPeerConnection | null = null

export async function applyOffer(sdp: string): Promise<void> {
  const api = getViewerApi()
  const set = useViewerStore.getState()
  if (pc) await close()
  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })

  pc.ontrack = (ev) => {
    const [stream] = ev.streams
    if (stream) set.setStream(stream)
  }
  pc.ondatachannel = (ev) => {
    const current = useViewerStore.getState()
    if (ev.channel.label === DC_MOUSE_LABEL) set.setDc(ev.channel, current.keyDc)
    if (ev.channel.label === DC_KEYBOARD_LABEL) set.setDc(current.mouseDc, ev.channel)
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) api.signalingOut({ v: 1, t: 'ice', candidate: e.candidate.toJSON() })
  }
  pc.onconnectionstatechange = () => {
    if (!pc) return
    if (pc.connectionState === 'connected') set.setPhase('streaming')
    if (pc.connectionState === 'failed') { set.setPhase('failed'); api.sessionEnd('ice-failed') }
  }

  await pc.setRemoteDescription({ type: 'offer', sdp })
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  api.signalingOut({ v: 1, t: 'answer', sdp: answer.sdp! })
  set.setPhase('negotiating')
}

export async function addRemoteIce(candidate: RTCIceCandidateInit): Promise<void> {
  if (!pc) return
  try { await pc.addIceCandidate(candidate) } catch { /* ignore */ }
}

export async function close(): Promise<void> {
  const { setStream, setDc, setPhase } = useViewerStore.getState()
  pc?.close()
  pc = null
  setStream(null)
  setDc(null, null)
  setPhase('idle')
}

export function getPc(): RTCPeerConnection | null { return pc }
```

- [ ] **Step 3: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/renderer/viewer/store.ts packages/desktop/src/renderer/viewer/pc-controller.ts
git commit -m "feat(desktop/viewer): PC controller (answerer) + zustand store"
```

---

### T43: Viewer input sender — mouse throttler

**Implements:** spec §9.4

**Files:**
- Create: `packages/desktop/src/renderer/viewer/input-sender.ts`
- Create: `packages/desktop/tests/throttler.test.ts`

- [ ] **Step 1: Failing test**

```ts
// packages/desktop/tests/throttler.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createMouseThrottler } from '../src/renderer/viewer/input-sender.js'

describe('mouse throttler', () => {
  it('coalesces rapid moves and sends at most once per interval', async () => {
    vi.useFakeTimers()
    const sent: unknown[] = []
    const t = createMouseThrottler({ minIntervalMs: 8, send: (m) => sent.push(m) })
    t({ x: 0.1, y: 0.1 })
    t({ x: 0.2, y: 0.2 })
    t({ x: 0.3, y: 0.3 })
    expect(sent).toEqual([{ t: 'mm', x: 0.1, y: 0.1 }]) // first sent immediately
    vi.advanceTimersByTime(9)
    expect(sent.at(-1)).toEqual({ t: 'mm', x: 0.3, y: 0.3 }) // last coordinate flushed
    expect(sent).toHaveLength(2)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/desktop/src/renderer/viewer/input-sender.ts
import { useViewerStore } from './store.js'
import {
  type MouseMsg, type KeyMsg, encodeMods, computeContentRect, clamp01,
  MODIFIER_SYNC_INTERVAL_MS, MOUSE_BUFFER_THRESHOLD_BYTES,
} from '@desk/shared'

export type MouseThrottlerOpts = {
  minIntervalMs: number
  send: (m: MouseMsg) => void
}

export function createMouseThrottler(opts: MouseThrottlerOpts) {
  let pending: { x: number; y: number } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastSent = 0
  const flush = () => {
    timer = null
    if (!pending) return
    lastSent = Date.now()
    opts.send({ t: 'mm', x: pending.x, y: pending.y })
    pending = null
  }
  return (p: { x: number; y: number }) => {
    pending = p
    if (timer) return
    const elapsed = Date.now() - lastSent
    if (elapsed >= opts.minIntervalMs) flush()
    else timer = setTimeout(flush, opts.minIntervalMs - elapsed)
  }
}

function dcSafeSend(dc: RTCDataChannel | null, msg: MouseMsg | KeyMsg): void {
  if (!dc || dc.readyState !== 'open') return
  if (msg.t === 'mm' && dc.bufferedAmount > MOUSE_BUFFER_THRESHOLD_BYTES) return // drop
  dc.send(JSON.stringify(msg))
}

export function bindViewerInputs(videoEl: HTMLVideoElement): () => void {
  const sendMouse = (m: MouseMsg) => dcSafeSend(useViewerStore.getState().mouseDc, m)
  const sendKey = (m: KeyMsg) => dcSafeSend(useViewerStore.getState().keyDc, m)
  const throttledMove = createMouseThrottler({ minIntervalMs: 8, send: sendMouse })

  const toNorm = (e: MouseEvent) => {
    const { videoWidth, videoHeight } = videoEl
    if (!videoWidth || !videoHeight) return null
    const r = videoEl.getBoundingClientRect()
    const rect = computeContentRect(r.width, r.height, videoWidth, videoHeight)
    return {
      x: clamp01((e.clientX - r.left - rect.x) / rect.w),
      y: clamp01((e.clientY - r.top - rect.y) / rect.h),
    }
  }
  const buttonMap: Record<number, 0 | 1 | 2> = { 0: 0, 1: 1, 2: 2 }
  const onMove = (e: MouseEvent) => { const p = toNorm(e); if (p) throttledMove(p) }
  const onDown = (e: MouseEvent) => { const p = toNorm(e); if (p) sendMouse({ t: 'md', ...p, b: buttonMap[e.button] ?? 0 }) }
  const onUp = (e: MouseEvent) => { const p = toNorm(e); if (p) sendMouse({ t: 'mu', ...p, b: buttonMap[e.button] ?? 0 }) }
  const onWheel = (e: WheelEvent) => {
    const p = toNorm(e); if (!p) return
    const lines = (n: number) => Math.sign(n) * Math.max(1, Math.round(Math.abs(n) / 100))
    sendMouse({ t: 'mw', ...p, dx: lines(e.deltaX), dy: lines(e.deltaY) })
    e.preventDefault()
  }
  const onContext = (e: MouseEvent) => e.preventDefault()

  const pressed = new Set<string>()
  const modsBitmap = (e: KeyboardEvent) => encodeMods({
    shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey,
  })
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing) return // IME guard
    pressed.add(e.code)
    sendKey({ t: 'kd', code: e.code, mods: modsBitmap(e) })
    e.preventDefault()
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.isComposing) return
    pressed.delete(e.code)
    sendKey({ t: 'ku', code: e.code, mods: modsBitmap(e) })
    e.preventDefault()
  }
  const onBlur = () => sendKey({ t: 'rk' })
  const syncTimer = setInterval(() => {
    sendKey({ t: 'sync', mods: 0, keys: [...pressed] })
  }, MODIFIER_SYNC_INTERVAL_MS)

  videoEl.addEventListener('mousemove', onMove)
  videoEl.addEventListener('mousedown', onDown)
  videoEl.addEventListener('mouseup', onUp)
  videoEl.addEventListener('wheel', onWheel, { passive: false })
  videoEl.addEventListener('contextmenu', onContext)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  return () => {
    clearInterval(syncTimer)
    videoEl.removeEventListener('mousemove', onMove)
    videoEl.removeEventListener('mousedown', onDown)
    videoEl.removeEventListener('mouseup', onUp)
    videoEl.removeEventListener('wheel', onWheel)
    videoEl.removeEventListener('contextmenu', onContext)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    sendKey({ t: 'rk' })
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter @desk/desktop test
git add packages/desktop/src/renderer/viewer/input-sender.ts packages/desktop/tests/throttler.test.ts
git commit -m "feat(desktop/viewer): input sender with throttling and IME guard"
```

---

### T44: Viewer stats poller

**Implements:** spec §12.2, §13

**Files:**
- Create: `packages/desktop/src/renderer/shared/webrtc/stats.ts`

- [ ] **Step 1: Implement**

```ts
// packages/desktop/src/renderer/shared/webrtc/stats.ts
export type LiveStats = {
  rttMs: number | null
  fps: number | null
  bitrateKbps: number | null
  lossPct: number | null
  width: number | null
  height: number | null
}

const empty: LiveStats = { rttMs: null, fps: null, bitrateKbps: null, lossPct: null, width: null, height: null }

export function startStats(pc: RTCPeerConnection, onUpdate: (s: LiveStats) => void): () => void {
  let lastBytes = 0
  let lastPackets = 0
  let lastLost = 0
  let timer: ReturnType<typeof setInterval> | null = setInterval(async () => {
    const stats = await pc.getStats()
    let snap: LiveStats = { ...empty }
    stats.forEach((r) => {
      if (r.type === 'inbound-rtp' && r.kind === 'video') {
        const bytes = (r as RTCInboundRtpStreamStats).bytesReceived ?? 0
        const packets = (r as RTCInboundRtpStreamStats).packetsReceived ?? 0
        const lost = (r as RTCInboundRtpStreamStats).packetsLost ?? 0
        const fps = (r as RTCInboundRtpStreamStats).framesPerSecond ?? null
        snap.bitrateKbps = Math.round(((bytes - lastBytes) * 8) / 1000)
        const dPackets = packets - lastPackets
        const dLost = lost - lastLost
        snap.lossPct = dPackets > 0 ? Math.round((dLost / (dPackets + dLost)) * 100) : 0
        snap.fps = fps !== null ? Math.round(fps) : null
        snap.width = (r as RTCInboundRtpStreamStats).frameWidth ?? null
        snap.height = (r as RTCInboundRtpStreamStats).frameHeight ?? null
        lastBytes = bytes; lastPackets = packets; lastLost = lost
      }
      if (r.type === 'candidate-pair' && (r as RTCIceCandidatePairStats).nominated) {
        snap.rttMs = Math.round(((r as RTCIceCandidatePairStats).currentRoundTripTime ?? 0) * 1000)
      }
    })
    onUpdate(snap)
  }, 1000)
  return () => { if (timer) { clearInterval(timer); timer = null } }
}
```

- [ ] **Step 2: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/renderer/shared/webrtc/stats.ts
git commit -m "feat(desktop/renderer): WebRTC stats poller"
```

---

### T45: Viewer UI — discovery + pairing screen

**Implements:** spec §12.2

**Files:**
- Create: `packages/desktop/src/renderer/viewer/App.tsx`
- Create: `packages/desktop/src/renderer/viewer/components/DiscoveryList.tsx`
- Create: `packages/desktop/src/renderer/viewer/components/PairForm.tsx`
- Create: `packages/desktop/src/renderer/viewer/main.tsx`

- [ ] **Step 1: DiscoveryList**

```tsx
// packages/desktop/src/renderer/viewer/components/DiscoveryList.tsx
type Item = { name: string; host: string; port: number }
type Props = { items: Item[]; onPick: (i: Item) => void }
export function DiscoveryList({ items, onPick }: Props) {
  if (items.length === 0) return <div className="text-neutral-500">No Agents found on LAN.</div>
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={`${it.host}:${it.port}`}>
          <button onClick={() => onPick(it)}
            className="w-full text-left p-3 rounded bg-neutral-900 hover:bg-neutral-800">
            <div className="font-medium">{it.name}</div>
            <div className="text-xs text-neutral-500">{it.host}:{it.port}</div>
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: PairForm**

```tsx
// packages/desktop/src/renderer/viewer/components/PairForm.tsx
import { useState } from 'react'
type Props = { initial?: { host?: string; port?: number }; onSubmit: (p: { host: string; port: number; code: string }) => void }
export function PairForm({ initial, onSubmit }: Props) {
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState<number>(initial?.port ?? 0)
  const [code, setCode] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ host, port, code: code.toUpperCase() }) }}
      className="space-y-3">
      <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Agent host" required
        className="w-full p-2 rounded bg-neutral-900" />
      <input value={port || ''} onChange={(e) => setPort(Number(e.target.value))} placeholder="Port" type="number" required
        className="w-full p-2 rounded bg-neutral-900" />
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Pair code (6 chars)" required maxLength={6}
        className="w-full p-2 rounded bg-neutral-900 tracking-widest uppercase" />
      <button className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500">Connect</button>
    </form>
  )
}
```

- [ ] **Step 3: App**

```tsx
// packages/desktop/src/renderer/viewer/App.tsx
import { useEffect } from 'react'
import { getViewerApi } from '../shared/api.js'
import { useViewerStore } from './store.js'
import { DiscoveryList } from './components/DiscoveryList.js'
import { PairForm } from './components/PairForm.js'
import { applyOffer, addRemoteIce } from './pc-controller.js'

export function ViewerApp() {
  const api = getViewerApi()
  const { agents, phase, setAgents, setPhase } = useViewerStore()

  useEffect(() => api.onEvent((e) => {
    if (e.type === 'discovery:found') setAgents(e.payload)
    else if (e.type === 'signaling:in') {
      const m = e.payload
      if (m.t === 'offer') { void applyOffer(m.sdp); setPhase('negotiating') }
      else if (m.t === 'ice') void addRemoteIce(m.candidate)
      else if (m.t === 'pair-result' && !m.ok) setPhase('failed')
      else if (m.t === 'bye') setPhase('idle')
    }
  }), [api, setAgents, setPhase])

  // StreamView is wired in T46; for now show a placeholder during streaming phases.
  if (phase === 'streaming' || phase === 'negotiating') {
    return <div className="h-full flex items-center justify-center text-neutral-500">Streaming… (StreamView in T46)</div>
  }

  const connect = (p: { host: string; port: number; code: string }) => {
    setPhase('pairing')
    void api.connectionStart({ agentHost: p.host, port: p.port, code: p.code })
  }

  return (
    <main className="h-full p-8 grid grid-cols-2 gap-8">
      <section>
        <h2 className="text-lg mb-3">Discovered Agents</h2>
        <DiscoveryList items={agents} onPick={(it) => {
          const code = prompt(`Pair code for ${it.name}`)
          if (code) connect({ host: it.host, port: it.port, code: code.toUpperCase() })
        }} />
      </section>
      <section>
        <h2 className="text-lg mb-3">Manual</h2>
        <PairForm onSubmit={connect} />
        {phase === 'failed' && <div className="mt-3 text-red-400">Pair failed.</div>}
      </section>
    </main>
  )
}
```

```tsx
// packages/desktop/src/renderer/viewer/main.tsx
import { createRoot } from 'react-dom/client'
import { ViewerApp } from './App.js'
import '../styles.css'
createRoot(document.getElementById('root')!).render(<ViewerApp />)
```

- [ ] **Step 4: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/renderer/viewer/
git commit -m "feat(desktop/viewer): discovery + pair UI"
```

---

### T46: Viewer UI — StreamView

**Files:**
- Create: `packages/desktop/src/renderer/viewer/components/StreamView.tsx`
- Create: `packages/desktop/src/renderer/viewer/components/StatsBar.tsx`
- Modify: `packages/desktop/src/renderer/viewer/App.tsx` (replace the T45 placeholder with `<StreamView />`)

- [ ] **Step 1: StatsBar**

```tsx
// packages/desktop/src/renderer/viewer/components/StatsBar.tsx
import type { LiveStats } from '../../shared/webrtc/stats.js'
type Props = { stats: LiveStats; onDisconnect: () => void; onFullscreen: () => void }
export function StatsBar({ stats, onDisconnect, onFullscreen }: Props) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-neutral-900 text-xs">
      <span>RTT {stats.rttMs ?? '–'}ms</span>
      <span>{stats.fps ?? '–'}fps</span>
      <span>{stats.bitrateKbps ?? '–'}kbps</span>
      <span>loss {stats.lossPct ?? '–'}%</span>
      <span>{stats.width ?? '–'}×{stats.height ?? '–'}</span>
      <div className="ml-auto flex gap-2">
        <button onClick={onFullscreen} className="px-2 py-1 bg-neutral-700 rounded">Fullscreen</button>
        <button onClick={onDisconnect} className="px-2 py-1 bg-red-700 rounded">Disconnect</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: StreamView**

```tsx
// packages/desktop/src/renderer/viewer/components/StreamView.tsx
import { useEffect, useRef, useState } from 'react'
import { useViewerStore } from '../store.js'
import { getViewerApi } from '../../shared/api.js'
import { bindViewerInputs } from '../input-sender.js'
import { startStats, type LiveStats } from '../../shared/webrtc/stats.js'
import { getPc, close as closePc } from '../pc-controller.js'
import { StatsBar } from './StatsBar.js'

export function StreamView() {
  const api = getViewerApi()
  const stream = useViewerStore((s) => s.stream)
  const ref = useRef<HTMLVideoElement>(null)
  const [stats, setStats] = useState<LiveStats>({ rttMs: null, fps: null, bitrateKbps: null, lossPct: null, width: null, height: null })

  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    if (!ref.current) return
    const unbindInputs = bindViewerInputs(ref.current)
    const pc = getPc()
    const stopStats = pc ? startStats(pc, setStats) : () => undefined
    return () => { unbindInputs(); stopStats() }
  }, [stream])

  return (
    <div className="h-full flex flex-col">
      <StatsBar
        stats={stats}
        onDisconnect={() => { api.sessionEnd('user'); void closePc() }}
        onFullscreen={() => ref.current?.requestFullscreen()}
      />
      <video ref={ref} autoPlay playsInline muted className="flex-1 bg-black object-contain" tabIndex={0} />
    </div>
  )
}
```

- [ ] **Step 3: Replace placeholder in `App.tsx`**

In `packages/desktop/src/renderer/viewer/App.tsx`, add at top:
```tsx
import { StreamView } from './components/StreamView.js'
```

Replace the streaming-phase placeholder block:
```tsx
if (phase === 'streaming' || phase === 'negotiating') return <StreamView />
```

- [ ] **Step 4: Commit**

```bash
pnpm --filter @desk/desktop typecheck
git add packages/desktop/src/renderer/viewer/
git commit -m "feat(desktop/viewer): stream view with stats bar"
```

---

### T47: Viewer renderer entry hookup (sanity)

This is a check that everything Phase-5 typechecks and lints; no new code.

- [ ] **Step 1: Run**

```bash
pnpm --filter @desk/desktop typecheck
pnpm --filter @desk/desktop lint
pnpm --filter @desk/desktop test
```

- [ ] **Step 2: If anything fails, fix inline. Do not skip — fix root cause.**

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore(desktop): pass typecheck/lint after Phase 5"
```

---

### T48: Empty/placeholder (kept for stable numbering)

Skip. Phase 5 wraps at T47.

---

### T49: Empty/placeholder (kept for stable numbering)

Skip.

---

## Phase 6 — Integration smoke & finalize

### T50: End-to-end smoke test pass

**Implements:** spec §14.2

This task is purely manual — no commits unless bugs surface.

- [ ] **Step 1: Build**

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

All must pass.

- [ ] **Step 2: Run two instances side by side**

Terminal A: `pnpm dev:agent`
Terminal B: `pnpm dev:viewer`

- [ ] **Step 3: Execute the spec §14.2 checklist (annotate result inline below):**

1. Agent window shows a 6-char Base32 code. ☐
2. Viewer window lists the Agent under "Discovered Agents" within 5s. ☐
3. Click the Agent, paste the code → stream appears within 3s. ☐
4. Move mouse over the video — pointer on the Agent moves. ☐
5. Left-click, right-click, scroll wheel all reflect on Agent. ☐
6. Type letters and Cmd/Ctrl combinations (e.g., Cmd+C in a text editor). ☐
7. Disconnect from the Viewer toolbar → Agent returns to pairing. ☐
8. Try wrong pair code 3 times → Agent locks for 60s, code rotates. ☐
9. Open a second Viewer and try to connect → rejected with peer-busy. ☐
10. Long-press Shift, close the Viewer abruptly → Agent does not remain stuck in Shift. ☐
11. Cut Wi-Fi briefly → Viewer shows "connection unstable"; reconnect → recovers or fails cleanly. ☐

- [ ] **Step 4: File a follow-up note for any ☐ that failed**

For any failure, open `docs/specs/2026-05-17-known-issues.md` (create if absent), record the symptom, and either (a) fix and recommit, or (b) defer with rationale.

---

### T51: README run/test instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README to include**

- A 30-second quickstart (install + run agent + run viewer)
- A bullet list of known limitations (copy from spec §1.3 non-goals, §11.2 risks)
- A pointer to the spec for full architecture

Example body to merge in:

```markdown
## 30-second quickstart

1. `pnpm install`
2. Terminal A: `pnpm dev:agent` — note the 6-char code shown.
3. Terminal B: `pnpm dev:viewer` — pick the Agent from the list, paste the code.
4. The Agent's screen appears in the Viewer. Mouse and keyboard are forwarded.

## Known limitations (M1)

- LAN only (no public network / NAT traversal). Public network and mobile clients arrive in M2.
- Single Viewer per Agent.
- IME (Chinese input) not supported.
- Captures primary display only.
- macOS users must grant Screen Recording and Accessibility permissions to the Electron app.
- System shortcuts (Cmd+W, Cmd+Q, etc.) act on the Viewer, not the Agent.

## References

- [Architecture spec](docs/specs/2026-05-17-remote-desktop-design.md)
- [Implementation plan](docs/plans/2026-05-17-remote-desktop-m1.md)
- [CLAUDE.md](CLAUDE.md) — repository conventions
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README quickstart and known limitations"
```

---

### T52: Tag the M1 baseline

- [ ] **Step 1: Confirm clean**

```bash
git status     # clean
git log --oneline | head -10
```

- [ ] **Step 2: Tag (do NOT push — user-only decision per CLAUDE.md §7)**

```bash
git tag -a m1-baseline -m "Remote Desktop M1: LAN desktop-to-desktop core path"
```

- [ ] **Step 3: Print the tag** so the user can decide whether to push

```bash
git tag --list
```

End of plan.
