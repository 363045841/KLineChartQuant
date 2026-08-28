# Native Pi Runtime - Technical Design

## Boundaries

```text
packages/vue (shared Web UI)
  AgentWorkbenchShell -> AgentBridgeClient -> AgentUiEvent reducer
                              |
packages/desktop-electron     | method IPC + MessagePort
  preload NativeAgentBridge --+-----------------------------+
  Main AgentIpcRouter <--------------------------------------+
                              |
packages/agent-runtime        v
  AgentApplicationService -> PiRunDriver -> Pi Agent
  RuntimeSessionService   -> Pi SessionRepo -> SQLite / memory
  EventProjector          -> stable AgentUiEvent
  RuntimeToolProvider     -> faux proxy now, canonical adapter later
```

`agent-runtime` owns provider-neutral orchestration, normalized contracts,
session semantics, event mapping, tracing, and redaction. `desktop-electron`
owns Electron object lifetimes, sender/target validation, MessagePorts, and
composition of the Node SQLite adapter. Vue owns view state only.

## Package Shape

```text
packages/agent-runtime/
  src/
    contracts/       UI, IPC, session, error, trace schemas and types
    application/     AgentApplicationService and run/session coordination
    pi/              Pi driver, event projector, faux test factory
    sessions/        repository adapter, branch/replay/migration logic
    security/        redaction and safe structured diagnostics
    testing/         in-memory repository, scripted provider, fake tools
    index.ts
    node.ts          SQLite repository composition only
```

The root export is browser-safe at module-load time. Node-only `node:sqlite` code
is reachable through `./node`, allowing Vue/Web builds to import contracts
without pulling Node builtins. `./testing` contains deterministic fixtures but
is not model-visible capability.

Dependencies are pinned together at 0.84.2:

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-session-backend-sqlite-node`
- `typebox` 1.3.7 for shared IPC schemas

The SQLite package declares Node >=22.19 while the repository still tests
22.12. The Node adapter remains a separate export; its integration suite is run
where `node:sqlite` supports the backend, and Electron production uses its
bundled modern Node. Hardening will align the repository engine/CI floor rather
than silently replacing Pi persistence.

## Shared Contract Ownership

PR #124 initially places `agent-contracts.ts` in Vue. This child moves the
transport-neutral definitions into `agent-runtime/contracts` and updates Vue to
import/re-export them. The protocol remains version 1 because runtime is filling
the already reserved command/event behavior rather than changing its wire shape.

IPC envelopes use a distinct `AGENT_IPC_PROTOCOL_VERSION` and per-command
payload schema version. Runtime view types never contain Provider response
objects, Pi messages, Electron events, AbortSignals, functions, or mutable host
objects.

## Pi Driver

`PiRunDriver` creates one low-level Pi `Agent` per active run from an immutable
`RunPlan`:

```ts
interface RunPlan {
  sessionId: string
  runId: string
  turnId: string
  prompt: string
  readOnly: boolean
  scope: FrozenChartScope
  transcript: AgentMessage[]
  tools: RuntimeToolDefinition[]
}
```

The driver subscribes to Pi events before calling `prompt()`. It maps text
deltas, message barriers, and tool lifecycle to internal `RuntimeEvent`s. It
ignores thinking deltas and never serializes Pi's partial assistant message.
Runtime tool IDs are `runId + raw Pi toolCallId` through an injective encoder;
traces retain the raw ID only in Main-owned redacted storage.

Pi supplies argument validation and the active abort signal to tool execution.
The later canonical adapter supplies stricter policy/capability checks. The
driver counts tool-bearing turns. `shouldStopAfterTurn` sets a loop-limit fault
at eight by default and refuses configuration over twelve. A limit fault wins
over the otherwise normal Pi settlement and becomes `TOOL_LOOP_LIMIT`.

## Run State Machine

```text
created -> running -> completed
                   -> failed
                   -> cancelling -> cancelled
                                -> partial
                   -> interrupted (process/target loss)
```

Only the application service writes state transitions. Terminal transitions are
idempotent. Cancellation first persists/announces `cancelling`, then calls Pi
abort, then waits for `waitForIdle()` before choosing `cancelled` or `partial`
from already persisted successful reversible tool evidence.

One active run per session is enforced by an in-memory ownership table backed by
durable open-operation records. Startup scans open operations; they become
`interrupted`, never `completed`. Terminal and unknown run operations return
typed errors.

## Session And Branch Model

Pi `SessionRepo` is injected. Production uses `SqliteSessionRepository`; tests
use `InMemorySessionRepo`. A KQ schema version is stored in session metadata and
custom entries use namespaced discriminants:

- `kq.run.started`, `kq.run.terminal`
- `kq.tool.trace`, `kq.tool.mapping`
- `kq.scope.snapshot`, `kq.event.checkpoint`

Standard user, assistant, and tool-result messages remain Pi message entries.
Session title uses Pi's name fact. Run trace entries are JSON-serializable and
redacted before append.

The main lane is the current conversation. A normal follow-up appends to it.
Retry finds the original user entry, creates a new lane at its parent, and
prompts the same user content on that lane with a new run. No old assistant or
tool-result entry is copied into the new branch. Branch mapping is persisted so
reopen and repeated retry are deterministic.

Migrations are pure version-to-version functions for KQ metadata/custom payloads
and are tested with fixtures. A future schema version throws
`SESSION_SCHEMA_UNSUPPORTED`; corrupt payloads throw `SESSION_CORRUPT` without
partially rewriting the database.

## Stable Event Projection

The projector emits the PR #124 event union and adds protocolVersion exactly
once. Key mappings are:

| Pi/runtime source | Application event |
| --- | --- |
| service accepts run | `run.started`, `user.message.created` |
| assistant message start | `assistant.message.started` |
| Pi `text_delta` | `assistant.text.delta` |
| assistant barrier | `assistant.message.completed` |
| tool execution start/update/end | `tool.started/progress/finished` |
| cancel requested | `run.cancelling` |
| settled abort | `run.cancelled` with partial flag |
| settled success + usage | `run.completed` |
| mapped fault | `run.failed` |

Event sequence numbers and durable checkpoints support replay-then-live without
duplicates. Subscribers request events after a known sequence. Renderer batches
deltas for display; runtime preserves exact provider order.

## Electron IPC

`AgentIpcRouter` registers a fixed channel table. Every command parses a TypeBox
schema with `additionalProperties: false`, checks the deadline and 256 KiB P0
payload ceiling, validates `event.senderFrame` against the registered main frame,
and verifies that the window/chart/session/run belongs to that sender.

Request IDs are retained in a bounded TTL dedupe map. An identical completed
request returns the first result; a conflicting duplicate is
`DUPLICATE_REQUEST`. Main runtime dispatch happens only after validation.

Main creates a `MessageChannelMain`, retains `port1`, and transfers `port2` to
preload. Preload exposes `AgentBridgeClient` methods and `subscribe()` only. Port
close or `webContents` destruction releases ownership and aborts active runs.
Renderer never receives Electron event objects or a raw port.

## Errors, Redaction, And Logging

`AgentRuntimeError` contains a stable code, retryable flag, safe message, and
optional action. Unknown thrown values are mapped once at adapter boundaries.
Provider message text is never used to choose recovery behavior.

Redaction recursively removes secret-shaped keys and replaces registered secret
values in strings. It also strips Authorization headers, hidden thinking blocks,
and app/user path prefixes. The same function is applied before events,
persistence, logs, errors, and snapshots.

Logging is an injected `RuntimeLogSink` receiving level, event name, correlation
IDs, durations, and safe structured fields. Domain code does not call console.

## Deterministic Test Architecture

Pi AI `fauxProvider()` scripts assistant text and tool calls. Tests use the real
Pi `Agent`, in-memory Pi sessions, and fake tools whose signals/results are
observable. SQLite tests reopen a real temporary database and cover migrations,
branch recovery, writer lifecycle, and delete semantics.

Electron contract tests instantiate the router with fake sender/port/runtime
adapters. A focused Electron E2E uses a faux runtime flag, native preload bridge,
the shared Vue reducer, and no network or credential.

## Integration And Rollback

Development occurs on an integration branch containing PR #124 and #125 because
this child consumes both contracts. Runtime commits remain isolated after those
parents and will be rebased onto upstream main once both land. The final PR must
not duplicate unrelated fork-main commits.

Rollback removes `agent-runtime`, native bridge composition, and the dependency
updates; the shared workbench continues to function through `FakeAgentBridge`.
