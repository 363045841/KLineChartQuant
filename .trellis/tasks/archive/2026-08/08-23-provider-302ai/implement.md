# 302.ai Provider Implementation Plan

## Ordered Checklist

1. Contract and error foundation
   - Add Provider model/status/test views and stable error codes.
   - Add `provider.models` schemas, application method, router/preload/native and
     fake bridge support.
   - Extend contract/router tests for strict payloads, dedupe, and no key echo.

2. Framework-neutral 302.ai support
   - Add credential/settings port types and versioned setting validation.
   - Implement URL normalization, `/models` parsing, bounded views, HTTP timeout,
     retry/`Retry-After`, and secret-safe error mapping.
   - Implement text and harmless tool-call probes with injected fetch fixtures.
   - Build the dynamic Pi provider and real `createPlan()` with zero fake tools.
   - Add exhaustive Provider contract, error, cancellation, and redaction tests.

3. Pi error projection
   - Add a narrow plan-level Provider error classifier/observer.
   - Preserve abort and runtime deadline behavior while projecting stable
     Provider failures from real stream termination.
   - Extend Pi driver tests for each new failure category and raw-message
     suppression.

4. Electron Main persistence and composition
   - Implement async safeStorage encrypted/memory-only credential adapter.
   - Implement versioned atomic non-secret settings storage.
   - Compose real support in production and retain Faux only in E2E mode.
   - Test weak Linux backend, unavailable encryption, async encryption,
     corruption, deletion, atomic replacement, and composition boundaries.

5. Shared Vue settings UX
   - Add refresh/model selection/stage results/error/warning controls to the
     existing shared dialog and workspace composable.
   - Keep key fields one-way and drafts/modal state stable on failures.
   - Update English/Chinese copy, fake bridge, reducer/component tests, and
     Electron E2E assertions.

6. Live model evaluation
   - Add opt-in `KQ_302AI_API_KEY` runner, Arena prior metadata, non-legacy
     filter, repeated probe/latency collection, Pareto calculation, budget caps,
     and redacted JSON report.
   - Add deterministic ranking tests and CI workflow dispatch/nightly wiring.
   - Run only when the environment variable exists; otherwise record the exact
     skip without attempting a request.

7. Package and security audit
   - Build runtime and Electron unpacked app.
   - Inspect `app.asar` for Runtime/Pi assets, migration, Faux, secrets, source,
     tests, and credential payloads.
   - Confirm the production path references real support and contains no
     unavailable/scripted fallback.

8. Final convergence
   - Run `trellis-check`, affected and full integration gates, update specs,
     archive the child task, commit focused files, push the branch, and open a
     non-draft PR that declares its dependency on the native runtime PR.

## Validation Commands

```bash
pnpm --filter @363045841yyt/klinechart-agent-runtime test
pnpm --filter @363045841yyt/klinechart-agent-runtime coverage
pnpm --filter @363045841yyt/klinechart-agent-runtime build
pnpm --filter @363045841yyt/klinechart-vue test
pnpm --filter @363045841yyt/klinechart-desktop test
pnpm --filter @363045841yyt/klinechart-desktop typecheck
pnpm --filter @363045841yyt/klinechart-desktop test:e2e
pnpm --filter @363045841yyt/klinechart-desktop build:unpack
pnpm install --frozen-lockfile
```

The live command is run only when `KQ_302AI_API_KEY` is exported. Its output is
checked for redaction before retention. Core/ai-runtime full suites run in the
last integration pass because this branch changes shared contract behavior.

## Review Gates

- No API key value appears in a response type, status object, persisted
  settings, exception text, logger field, snapshot, report, or package audit.
- No production module imports `testing`, `fauxProvider`, or the unavailable
  runtime support.
- Every model marked compatible has passed the exact harmless tool-call probe.
- Credential deletion does not touch SQLite sessions and blocks subsequent
  network calls.
- The weak Linux backend is visibly memory-only and never opts into Electron
  plaintext encryption.
- Live/Arena claims clearly distinguish public quality prior, 302.ai catalog
  availability, compatibility, and locally measured speed.

## Risky Files And Rollback Points

- `contracts/ui.ts` and `contracts/ipc.ts`: keep protocol changes atomic across
  preload, router, native/fake bridge, and Vue tests.
- `pi-run-driver.ts`: isolate error classification from existing cancellation,
  timeout, usage, and session semantics; revert independently if projection
  regresses.
- Electron credential files: use injected safeStorage/fs ports and never test
  against a real userData directory.
- `main.ts`: preserve the existing E2E-only lazy Faux import and shutdown order.
- Package/workflow changes: verify frozen lockfile and secret-free artifacts
  before pushing.

## Start Gate

- [x] Testable PRD is converged with no unresolved product question.
- [x] Cross-layer design and rollback shape are recorded.
- [x] Ordered implementation and verification plan are recorded.
- [x] User has repeatedly authorized implementation and requested a PR after
      convergence.
