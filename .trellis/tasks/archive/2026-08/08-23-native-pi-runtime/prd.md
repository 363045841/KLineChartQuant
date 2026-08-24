# Native Pi Runtime

## Goal

Deliver PRD PR-03: a framework-neutral Pi runtime and a typed Electron bridge
that connect the shared Agent workbench to a persistent Main-process agent loop.
The runtime must stream normalized application events, preserve sessions and run
traces, cancel provider and tool work, create real retry branches, and recover
interrupted work without exposing Pi internals or secrets to Renderer code.

## User Value

An analyst can start a real deterministic Agent run from the shared workspace,
watch its answer and tool activity stream, stop it without losing already
completed work, retry it as a new branch, and reopen the desktop app with the
same messages and trace history.

## Confirmed Facts

- Source scope is PRD FR-003, FR-004, FR-013, the runtime portion of FR-016,
  PR-03, and the relevant IPC/lifecycle boundaries in sections 11, 12, and 17.
- PR #124 owns the shared Vue/Web workbench and version-1 `AgentUiEvent` /
  `AgentBridgeClient` contract. Electron is a Web host and must not get a second
  Agent component tree.
- PR #125 owns `ChartController.agent`; this task may consume its public types
  but must not import Core internals.
- `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` 0.84.2 are current.
  Pi `Agent` exposes fine-grained message/tool events and AbortSignal propagation;
  Pi AI exposes a scripted faux provider.
- Pi's SQLite session backend is separately published as
  `@earendil-works/pi-session-backend-sqlite-node` 0.84.2. The runtime must use
  the Pi session abstraction rather than inventing a second transcript engine.
- Pi `AgentHarness` persists rich session state but exposes only coarse public
  run events. KQ therefore uses the low-level Pi `Agent` for event projection
  and Pi `Session` / `SessionRepo` for durable transcript and branch storage.
- Provider credentials, 302.ai model discovery, canonical tool policy, verified
  chart mutations, and turn undo are owned by later children. This task defines
  their interfaces and uses faux/in-memory implementations only.
- P0 is single-window, but every command is scoped by window and chart IDs so a
  later multi-window implementation does not require a protocol break.

## Requirements

### R1. Framework-Neutral Runtime Package

- Add `packages/agent-runtime` with no Vue, DOM, Electron Renderer, MCP transport,
  or Core-internal dependency.
- Pin the three Pi packages to one compatible release and expose stable package
  entries for shared contracts, runtime APIs, test support, and Node persistence.
- Move ownership of transport-neutral Agent UI/IPC types to this package; Vue
  may re-export them for compatibility but must consume the shared source.
- Keep Pi event types, provider payloads, hidden thinking content, and raw tool
  results behind runtime adapters.

### R2. Pi Run Lifecycle

- Build each run with Pi `Agent`, an explicit model/stream function, a minimal
  system prompt, a frozen run scope, and only tools supplied by a runtime tool
  provider.
- Generate KQ-owned `sessionId`, `runId`, `turnId`, message IDs, request IDs, and
  globally unique UI tool-call IDs. A retry must never reuse the old run or UI
  tool-call identity even if a scripted Provider repeats its raw ID.
- Permit read-only tools to use the configured parallel mode; later write tools
  can force Pi sequential execution through their definitions.
- Enforce a default eight tool turns and hard maximum twelve. Crossing the limit
  ends with `TOOL_LOOP_LIMIT`, not a successful completion.
- Inject only minimal chart scope metadata at run start. Full bar arrays and
  arbitrary host state must never be inserted into the prompt automatically.

### R3. Sessions, Branches, And Persistence

- Support create, list, open, rename, delete, and recovery through a repository
  abstraction backed in production by Pi's SQLite session repository.
- Persist schema-versioned KQ metadata, user/assistant/tool-result messages,
  run status, raw-to-public tool-call mapping, trace fields, usage, errors, and
  interrupted state as JSON-serializable session entries/records.
- Deleting a session removes its messages and trace but does not affect Provider
  settings. Renaming changes only session catalog metadata.
- Normal follow-ups append to the active branch. Retrying a user turn creates a
  new Pi session lane/branch at the original pre-turn parent and replays only
  the chosen user prompt; old tool results are never executed again.
- Opening a store created by an older supported KQ schema applies explicit,
  deterministic migrations. Unknown future schemas fail closed.

### R4. Stable Event Projection And Replay

- Project Pi lifecycle events into the versioned `AgentUiEvent` contract used by
  PR #124. No raw Pi event may cross the application boundary.
- Emit ordered run, user message, assistant start/delta/end, tool start/progress/
  finish, cancellation, failure, completion, sessions-changed, and provider-status
  events with stable serializable view models.
- Drop hidden thinking deltas. Action summaries are explicit application events,
  never exposed chain of thought.
- Aggregate Pi usage without assuming every Provider reports cost or token
  detail. Missing fields remain absent rather than fabricated as zero.
- A subscriber connecting after restart can obtain a deterministic replay or
  snapshot before live events, without duplicating already applied events.

### R5. Stop, Retry, Follow-Up, And Recovery

- `cancelRun` emits `run.cancelling` immediately, calls Pi abort, propagates the
  same AbortSignal to pending tools, waits for settlement, and persists the final
  `cancelled` or `partial` state.
- Completed mutations reported by a tool remain visible after cancellation.
  Cancellation must not rewrite them as if they never occurred.
- `retryRun` creates a new run and branch from the selected original prompt.
  Provider/tool failures never resume by silently reusing the old identifiers.
- A follow-up after completion appends to the current branch. Steering during an
  active run remains disabled for P0 unless the stable bridge explicitly adds it.
- On startup, any durable run without a terminal record becomes `interrupted`.
  The UI may inspect it and retry, but it is never reported as completed.
- Only one active run is allowed per session. Unknown, terminal, or cross-session
  run commands return stable errors.

### R6. Typed Electron IPC And Streaming

- Expose method-level preload functions only; never expose raw `ipcRenderer`,
  channel names, Electron event objects, filesystem access, or environment data.
- Every command envelope includes protocol and payload schema versions,
  `windowId`, `chartId`, `requestId`, deadline, and applicable session/run IDs.
- Main validates protocol, schema, deadline, payload size, sender frame, window
  ownership, duplicate request ID, and target ownership before reaching runtime.
- Commands use `ipcRenderer.invoke` / `ipcMain.handle`. High-frequency events use
  `MessageChannelMain` / MessagePort and preserve ordering.
- Port closure, Renderer destruction/reload, and window close cancel owned work
  or persist it as interrupted; Main never waits indefinitely for Renderer.
- The browser preview continues using a fake bridge. Electron selects the native
  bridge without changing shared components or reducer behavior.

### R7. Errors, Trace, Privacy, And Data Minimization

- Return stable structured errors with `code`, human-safe message, `retryable`,
  and optional recommended action. Consumers never branch on message text.
- Trace records include correlation IDs, duration, result status, tool version
  when known, observed revisions when supplied, and optional usage/cost.
- Central redaction runs before events, persistence, diagnostics, errors, test
  snapshots, and exported trace-shaped values. Authorization headers, API keys,
  environment secrets, hidden thinking, and sensitive local paths are excluded.
- Runtime logging uses an injected structured sink and safe metadata only; no
  direct console output from runtime domain code.
- Provider and tool operations have deadlines and AbortSignal behavior. Timeout,
  cancellation, target loss, protocol failure, and loop limit have distinct codes.

### R8. Deterministic Integration

- Use Pi AI's faux provider rather than a hand-written model loop.
- Cover text streaming, one and multiple tools, provider failure, abort while
  streaming, abort during a tool, loop limit, retry branch, persistence/reopen,
  interrupted recovery, replay, and redaction with deterministic tests.
- Add a fake Renderer tool provider/proxy that proves signal propagation and
  event/trace mapping without claiming real chart mutation support.
- Add IPC contract tests plus an Electron integration path using the shared UI
  reducer. Tests assert persisted state and runtime events, not chat wording alone.

## Acceptance Criteria

- [x] `packages/agent-runtime` builds under strict TypeScript and its public
      declarations contain no Vue, Electron Renderer, MCP transport, or Core
      internal types.
- [x] A Pi faux run streams normalized ordered deltas and terminal usage through
      the same `AgentUiEvent` reducer used by Web and Electron.
- [x] Session create/rename/delete, normal follow-up, retry branch, reopen, and
      schema migration tests pass against in-memory and SQLite repositories.
- [x] Stop reaches Provider and tool AbortSignals; terminal state is cancelled or
      partial according to persisted completed tool evidence.
- [x] Retry produces new run, turn, and public tool-call IDs and does not execute
      any prior tool result.
- [x] Tool-loop limit, provider failure, timeout, stale command, duplicate request,
      invalid protocol/payload, target loss, and interrupted startup produce the
      documented stable errors and states.
- [x] Main sender/ownership checks run before runtime dispatch; MessagePort closure
      aborts the owned run; preload exposes no raw Electron primitive.
- [x] Electron and Web consume one shared contract/component tree; Electron native
      bridge can replace the fake bridge without component conditionals.
- [x] Secret/redaction tests prove injected keys, Authorization values, hidden
      thinking, and sensitive paths do not appear in events, persistence, logs,
      errors, snapshots, or test artifacts.
- [x] Agent-runtime unit/contract/integration suites, Desktop IPC tests, affected
      Vue tests, package builds, and existing Core/ai-runtime tests pass with no
      new baseline regression.

## Out Of Scope

- 302.ai credentials, model catalog refresh, compatibility probing, and live
  network tests; `08-23-provider-302ai` owns those production implementations.
- Canonical TypeBox tool registry, MCP parity, policy/confirmation enforcement,
  chart revision checks, postconditions, idempotency, and turn undo; the registry
  and chart-tool children own those behaviors.
- P1 steering UX, rich trace export, multi-window selection, cloud sync, general
  file/shell tools, hidden reasoning display, and real trading side effects.
