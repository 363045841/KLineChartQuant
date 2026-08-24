# Native Agent Runtime

## 1. Scope / Trigger

Use this contract when changing `packages/agent-runtime`, composing it in an
Electron Main process, extending Agent IPC, or packaging Pi session support.
Vue and Electron Renderer code consume only normalized contracts; Provider,
Pi, SQLite, credential, and Electron object lifetimes remain behind Main-owned
adapters.

## 2. Signatures

```ts
interface RuntimeSupport {
  provider: {
    getStatus(): ProviderStatusView | Promise<ProviderStatusView>
    test(input: ProviderTestInput): Promise<ProviderTestResult>
    deleteCredential(): Promise<void>
  }
  createPlan(context: RunPersistenceContext): PiRunPlan | Promise<PiRunPlan>
}

interface AgentIpcEnvelope {
  protocolVersion: 1
  payloadVersion: 1
  windowId: string
  chartId: string
  requestId: string
  deadlineAt: number
  command: AgentIpcCommand
  payload: unknown
}
```

Stable package entries are `.`, `./contracts`, `./contracts/ui`, `./node`, and
`./testing`. The root entry must remain browser-safe. SQLite composition is
imported from `./node`; deterministic Faux support is imported from `./testing`
only in an `e2e` build.

## 3. Contracts

- `AgentApplicationService` is the only writer of run state transitions and
  assigns a process-wide monotonic `sequence` to replayable UI events.
- Session snapshots carry `lastSequence`. Renderer subscribes before loading a
  snapshot, buffers live events, installs the snapshot, then applies only events
  whose sequence is newer.
- Production Electron uses Pi SQLite sessions under `app.getPath('userData')`.
  Startup converts runs without a terminal record to `interrupted`.
- Main validates schema, deadline, payload size, main-frame sender, window/chart
  target, request deduplication, and session/run ownership before dispatch.
- ContextBridge exposes method-level `AgentBridgeClient` functions. Raw
  `ipcRenderer`, channel names, MessagePorts, Pi payloads, and Electron events
  never cross into Renderer code.
- Credentials and secret values are Main-only and pass through central
  redaction before events, persistence, logs, and structured errors.
- Production packages exclude runtime source, coverage, tests, and
  `dist/testing`. Pi's `001_initial.sql` migration must remain in `app.asar`.
- A missing production Provider fails closed with `PROVIDER_NOT_CONFIGURED`; it
  must never return scripted or Faux text. Production builds must not contain a
  Faux import. `electron-vite build --mode e2e` is the only desktop build that
  may include it.

## 4. Validation & Error Matrix

| Condition                                  | Stable result                                 |
| ------------------------------------------ | --------------------------------------------- |
| Protocol or payload version mismatch       | `INVALID_PROTOCOL` / `INVALID_PAYLOAD`        |
| Expired deadline or oversized payload      | `DEADLINE_EXCEEDED` / `PAYLOAD_TOO_LARGE`     |
| Non-main frame or wrong window/chart owner | `TARGET_MISMATCH`                             |
| Reused request ID with different input     | `DUPLICATE_REQUEST`                           |
| Missing Provider adapter or credential     | `PROVIDER_NOT_CONFIGURED`                     |
| Tool/provider deadline or explicit stop    | `TIMEOUT` / terminal cancelled or partial run |
| More than the configured tool-turn limit   | `TOOL_LOOP_LIMIT`                             |
| Unknown future session schema              | `SESSION_SCHEMA_UNSUPPORTED`                  |
| Open run found during startup recovery     | persisted `interrupted` run                   |

Consumers branch on `code`, never message text. Unknown errors are normalized
once at the adapter boundary and returned without raw Provider details.

## 5. Good / Base / Bad Cases

- Good: Main imports runtime APIs from `.`, SQLite from `./node`, and dynamically
  imports `./testing` only in a compile-time `e2e` branch.
- Base: no Provider is configured; sessions still open and persist, while test
  and run commands return `PROVIDER_NOT_CONFIGURED`.
- Bad: Renderer reads an environment key, imports Pi, opens SQLite, listens on a
  raw IPC channel, or production falls back to a scripted response.

## 6. Tests Required

- Runtime unit/integration: ordered streaming, tool lifecycle, abort signal,
  timeout, retry branch IDs, loop limit, migration, restart recovery, replay,
  and redaction.
- IPC contract: forged sender, strict schema, non-JSON input, deadline, size,
  dedupe conflict, ownership, structured preload error, and port cleanup.
- Electron E2E: native bridge streaming/cancel, SQLite reopen, shared reducer,
  chart canvas pixels, and compact/desktop layout.
- Packaging: unsigned unpack build; assert runtime `dist` and Pi migration exist;
  assert runtime source/tests/coverage/`dist/testing`, Faux imports, and secret
  sentinels are absent.
- Package: strict TypeScript, `publint --strict`, direct `.` / `./node` Node ESM
  imports, and declaration scans for Vue/Electron/Core internal types.

## 7. Wrong vs Correct

### Wrong

```ts
import { createFauxRuntimeSupport } from '@363045841yyt/klinechart-agent-runtime/testing'

const support = createFauxRuntimeSupport()
```

This statically places the scripted Provider on the production path.

### Correct

```ts
const support: RuntimeSupport =
  import.meta.env.MODE === 'e2e'
    ? (await import('@363045841yyt/klinechart-agent-runtime/testing')).createFauxRuntimeSupport()
    : createUnavailableRuntimeSupport()
```

Vite removes the test branch from a production Main bundle. The later real
Provider adapter replaces `createUnavailableRuntimeSupport`, not the E2E path.
