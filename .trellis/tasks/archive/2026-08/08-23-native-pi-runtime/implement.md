# Native Pi Runtime - Execution Plan

## 0. Dependency And Branch Preparation

- [x] Confirm PR #124 and #125 remain green and inspect their exact heads.
- [x] Create `feat/native-pi-runtime` from the clean #125 head and integrate the
      #124 UI head without modifying either source branch.
- [x] Verify the integration tree contains one shared workbench and the public
      Core Agent facade, with no unrelated fork-main commits.
- [x] Run `trellis-before-dev` for backend, frontend, Electron, and package
      conventions before the first code edit.
- Rollback: keep both source PR heads untouched; abandon only the integration
  branch if dependency integration is wrong.

## 1. Contract-First Package Scaffold

- [x] Write failing contract tests for protocol versions, exhaustive event replay,
      strict IPC schemas, serializability, stable errors, and redaction.
- [x] Add `packages/agent-runtime` package/build/test configuration and exact Pi
      0.84.2 dependencies plus a browser-safe root export.
- [x] Move shared Agent contracts from Vue into the package; update Vue imports
      and compatibility re-exports without changing reducer behavior.
- [x] Add `./node` and `./testing` exports and package-boundary tests proving
      browser imports do not load Node/Electron modules.

## 2. Session Domain And Persistence

- [x] Write failing create/list/open/rename/delete, follow-up, retry-branch,
      interrupted-recovery, corrupt/future-schema, and migration tests.
- [x] Implement the Pi `SessionRepo` adapter, KQ metadata/custom entries, event
      checkpoints, run trace records, and pure migrations.
- [x] Implement in-memory test composition and Node SQLite composition using
      `SqliteSessionRepository` / `createNodeSqliteFactory`.
- [x] Reopen a real temporary SQLite database and prove transcript, trace, title,
      branches, terminal states, and deletion survive process recreation.

## 3. Pi Driver And Event Projection

- [x] Write faux-provider acceptance tests for text streaming, tool calls,
      optional usage, Provider failure, hidden thinking suppression, and ordering.
- [x] Implement `PiRunDriver` around the low-level Pi `Agent`, immutable run plan,
      tool metadata, public ID mapping, and event projector.
- [x] Add loop counting with default 8/hard 12 and `TOOL_LOOP_LIMIT` failure.
- [x] Persist each message/tool barrier before publishing terminal completion.
- [x] Prove no Pi event/type/provider payload leaks through public events or
      persisted trace-shaped values.

## 4. Application Service Lifecycle

- [x] Write failing tests for one-active-run ownership, unknown/stale commands,
      cancellation timing, abort propagation, partial cancellation, retry IDs,
      normal follow-up, replay cursors, and startup interruption.
- [x] Implement session commands and run coordinator with typed errors,
      timeouts/deadlines, idempotent terminal transitions, and event subscriptions.
- [x] Implement retry at the original user-entry parent on a new Pi lane.
- [x] Add fake Renderer tool provider/proxy tests that observe AbortSignal and
      completed-tool evidence without claiming real chart capabilities.

## 5. Typed Electron Bridge

- [x] Write router tests for forged sender, protocol/payload version, unknown
      fields, oversized payload, expired deadline, duplicate request, target
      ownership, out-of-order result, port close, reload, and window close.
- [x] Implement `AgentIpcRouter`, ownership registry, bounded request dedupe, and
      `MessageChannelMain` event delivery in Electron Main.
- [x] Extend preload with method-level native Agent functions and a hidden port
      adapter; expose no raw IPC/Event/Port primitive.
- [x] Add `NativeAgentBridgeClient` for the shared Vue host and select it only
      when the desktop preload bridge is present; browser preview keeps fake mode.
- [x] Compose an in-memory/faux runtime for deterministic Electron tests and a
      SQLite-backed Main service for production startup.

## 6. Integration And Quality

- [x] Run agent-runtime unit, contract, integration, SQLite, coverage, build,
      publint, and declaration-boundary checks.
- [x] Run affected Vue reducer/component tests and both Vue/Web builds.
- [x] Run Desktop TypeScript, Electron build/unpack smoke, IPC integration, and
      focused Playwright streaming/Stop/retry/reopen E2E with retries 0.
- [x] Re-run Core facade and ai-runtime suites to catch contract regressions.
- [x] Scan Renderer bundles, test output, logs, persisted fixtures, errors, and
      snapshots for injected secret values and forbidden Pi/Electron internals.
- [x] Run `trellis-check`, fix findings, and record baseline-only failures
      separately from this child.

## 7. Finish

- [x] Add executable runtime/IPC/session conventions to `.trellis/spec`.
- [x] Update the task acceptance checklist with direct evidence and exact test
      counts; keep future registry/provider/chart-tool work unchecked.
- [x] Commit runtime, spec/task, archive, and journal changes in Trellis order.
- [x] Rebase runtime-only commits after #124/#125 merge if necessary, push the
      focused branch, and open a PR with dependency and validation evidence.

## Canonical Validation Commands

```bash
pnpm --filter @363045841yyt/klinechart-agent-runtime test
pnpm --filter @363045841yyt/klinechart-agent-runtime coverage
pnpm --filter @363045841yyt/klinechart-agent-runtime build
pnpm --filter @363045841yyt/klinechart-agent-runtime lint:publish
pnpm --filter @363045841yyt/klinechart test
pnpm --filter @363045841yyt/klinechart build
pnpm --filter @363045841yyt/klinechart-desktop exec tsc --noEmit -p tsconfig.node.json
pnpm --filter @363045841yyt/klinechart-desktop exec tsc --noEmit -p tsconfig.web.json
pnpm --filter @363045841yyt/klinechart-desktop build:unpack
pnpm --filter @363045841yyt/klinechart-core test
pnpm --filter @363045841yyt/klinechart-ai-runtime test
```

## High-Risk Points And Rollback

- Contract ownership move: keep a Vue compatibility re-export and compare
  reducer fixtures before/after.
- Pi release drift: pin all Pi packages together and snapshot imported public
  contract shapes.
- SQLite engine floor: isolate Node adapter and do not weaken persistence to an
  ad hoc JSON store; hardening aligns CI/runtime versions.
- Cancellation races: persist barriers before terminal events and test abort at
  provider, tool, and post-tool timing points.
- MessagePort lifecycle: centralize ownership cleanup and use fake ports before
  Electron E2E.
- Dependency PR rebases: preserve runtime commits as a contiguous suffix so they
  can be replayed onto merged upstream without carrying parent diffs twice.

## Validation Evidence

- `@363045841yyt/klinechart-agent-runtime`: 31 tests passed; coverage 86.15%
  statements / 77.5% branches / 80.73% functions / 88.38% lines; strict
  TypeScript build and `publint --strict` passed.
- `@363045841yyt/klinechart`: 75 tests passed and the library/Web Component
  production build completed. The build still prints the two pre-existing
  `IndicatorRuntimeDescriptor.defaultConfig` diagnostics and exits successfully.
- `@363045841yyt/klinechart-desktop`: 4 IPC tests, Node TypeScript, project
  `vue-tsc --build`, and 2 Electron E2E tests passed with Playwright retries 0.
- Electron E2E asserts the shared native bridge, stream/cancel/restart flows,
  nonblank chart pixels, theme-matched chart gutters, and 16 px top/bottom chart
  spacing.
- Unsigned Electron unpack build passed. `app.asar` contains 49 runtime entries
  and Pi `001_initial.sql`; it contains no runtime source, coverage, tests,
  `dist/testing`, Faux import, Faux file, or test-secret sentinel.
- Core regression: 193 files / 2235 tests passed. AI Runtime regression: 8 files
  / 117 tests passed.
- Targeted ESLint and Oxlint passed with zero warnings; frozen lockfile install,
  direct package root / `./node` imports, declaration boundary scan, formatting,
  and `git diff --check` passed.
