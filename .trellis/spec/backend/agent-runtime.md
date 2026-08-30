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
    listModels(input: ProviderModelsInput): Promise<ProviderModelsResult>
    test(input: ProviderTestInput): Promise<ProviderTestResult>
    deleteCredential(): Promise<void>
  }
  createPlan(context: RunPersistenceContext): PiRunPlan | Promise<PiRunPlan>
}

interface AgentIpcEnvelope {
  protocolVersion: 2
  payloadVersion: 3
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
- The OpenAI-compatible Provider credential is accepted only by `provider.models` and
  `provider.test` request inputs. Renderer receives bounded model/status/test
  views and must never receive or persist the key. A configuration becomes
  runnable only after catalog, text, and exact harmless tool-call probes pass.
- The Provider has no built-in vendor endpoint. Renderer must submit an explicit
  HTTP(S) Base URL, and Main uses that normalized URL for model discovery,
  compatibility probes, and Pi streaming.
- The OpenAI-compatible Provider supports `openai-completions` and
  `openai-responses` through one protocol adapter boundary. The selected
  protocol owns Pi API selection, model `api` metadata, endpoint probes, and
  stream error classification; UI, application service, and `PiRunDriver`
  remain protocol-agnostic. Version 1 settings migrate to `openai-completions`.
- Production packages exclude runtime source, coverage, tests, and
  `dist/testing`. Electron Main bundles Agent runtime, Pi AI/Core, and the
  SQLite backend; `node:sqlite` remains a system import. Because the bundled
  backend resolves its migration at runtime, the build must explicitly emit
  Pi's `001_initial.sql` as `out/main/migrations/001_initial.sql` and preserve
  it in `app.asar`.
- A missing production Provider fails closed with `PROVIDER_NOT_CONFIGURED`; it
  must never return scripted or Faux text. Production builds must not contain a
  Faux import or testing chunk. `electron-vite build --mode e2e` is the only
  desktop build that may emit the separate testing chunk.

## 4. Validation & Error Matrix

| Condition                                  | Stable result                                 |
| ------------------------------------------ | --------------------------------------------- |
| Protocol or payload version mismatch       | `INVALID_PROTOCOL` / `INVALID_PAYLOAD`        |
| Expired deadline or oversized payload      | `DEADLINE_EXCEEDED` / `PAYLOAD_TOO_LARGE`     |
| Non-main frame or wrong window/chart owner | `TARGET_MISMATCH`                             |
| Reused request ID with different input     | `DUPLICATE_REQUEST`                           |
| Missing Provider adapter or credential     | `PROVIDER_NOT_CONFIGURED`                     |
| Provider 401 / 403 / 404                    | `PROVIDER_AUTHENTICATION` / `PROVIDER_PERMISSION` / `PROVIDER_MODEL_NOT_FOUND` |
| Provider 429 / 5xx / timeout                | `PROVIDER_RATE_LIMITED` / `PROVIDER_UNAVAILABLE` / `PROVIDER_TIMEOUT` |
| Malformed output / invalid tool call        | `PROVIDER_MALFORMED_RESPONSE` / `PROVIDER_INCOMPATIBLE_TOOLS` |
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
- Provider tests use injected fetch implementations and non-routable example
  endpoints; automated tests never require a vendor account or live API key.
- Both OpenAI-compatible protocols cover catalog discovery, their real text and
  harmless tool-call endpoints, run-plan creation, stream failure mapping, and
  persisted settings migration.
- Node matrix: a suite skipped for unsupported Node versions must use a
  type-only top-level import and dynamically import `./node` inside the gated
  test. `describe.skip` runs after static module evaluation and cannot protect
  Node 22.12 from an unavailable `node:sqlite` import.
- Clean checkout: host Vitest configs resolve workspace runtime imports to the
  runtime source, or explicitly build the dependency first. Unit tests must not
  pass only because a developer has a stale `packages/agent-runtime/dist`.
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

The settings UI uses the shared `BaseModal`; it does not duplicate overlay,
focus, transition, or responsive-dialog infrastructure.
