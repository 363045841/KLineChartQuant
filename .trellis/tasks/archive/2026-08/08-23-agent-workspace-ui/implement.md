# Agent Workspace UI - Execution Plan

## 1. Contract And State First

- [x] Add Given/When/Then reducer tests for streaming, success, confirmation,
      partial cancellation, retry, undo, errors, and stale event isolation.
- [x] Implement versioned UI models, bridge client, exhaustive event reducer,
      store/composable, and deterministic fake bridge.
- [x] Verify no Pi/Electron/raw IPC imports exist under feature components.

## 2. Shared Workspace Components

- [x] Move the contract, reducer, composable, components, and fake bridge into
      `packages/vue/src/features/agent` and export the supported API.
- [x] Implement `AgentWorkbenchShell.vue` with a chart slot, chart/panel split
      layout, toggle, resize separator, optional persistence adapter, and
      responsive drawer.
- [x] Implement header, timeline/message, tool, confirmation, error, evidence,
      context bar, composer, empty state, and settings-shell components.
- [x] Implement all focus, keyboard, live-region, tooltip, text wrapping, and
      reduced-motion behavior.
- [x] Keep styles domain-specific, quiet, compact, and compatible with both
      chart themes; avoid nested card/page-card composition.

## 3. Host Integration, Tests And Harness

- [x] Keep Electron `App.vue` as a thin host with desktop width storage and the
      E2E chart fixture; compose the same shell in the Web preview.
- [x] Move reducer/fake/component tests to the Vue package and keep Electron E2E
      focused on host launch, resize, streaming, Stop, and drawer behavior.
- [x] Add Playwright Electron config/fixtures for launch, resize, streaming,
      Stop, and drawer scenarios with retries disabled.
- [x] Add test-only scenario selection without exposing dev controls in release.
- [x] Run Renderer typecheck, unit/component tests, Electron E2E, lint on touched
      files, and unpacked Electron build.
- [x] Inspect screenshots at 1440x900, 1024x720, and 760x700; verify chart canvas
      has nonblank pixels and no UI overlap.

## Risk And Rollback

- Keep `KLineChart.vue` untouched; rollback removes the feature directory and
  restores the small `App.vue` shell.
- Keep the fake bridge behind the same interface used by Main later, preventing
  fixture-only component branches.
- Treat Electron packaging and Playwright setup as independent commits/checkpoints
  once explicit commit permission exists.
