# Agent Workspace UI - Technical Design

## Feature Boundary

The Renderer feature lives under `packages/vue/src/features/agent` because the
Electron Renderer is a Web/Vue host, not a separate UI layer. The shared feature
owns the contract, reducer, composable, components, fake runtime, and workbench
shell. `packages/desktop-electron/src/App.vue` and `packages/vue/preview/App.vue`
only compose that exported shell with a chart slot and host-specific adapters.
No shared component imports Electron, Pi, MCP, raw IPC, or chart internals.

```text
Electron App.vue / Web preview App.vue
  AgentWorkbenchShell
    chart slot (host renders KLineChart)
    AgentWorkspace
    AgentHeader
    AgentTimeline
      MessageItem
      ToolCallCard
      ConfirmationCard
      AgentErrorNotice
    AgentContextBar
    AgentComposer
    AgentSettingsDialog

useAgentWorkspaceStore
  reduceAgentUiEvent(state, event)
  AgentBridgeClient
    FakeAgentBridge (this child)
    NativeAgentBridge adapter (later child)
```

## Contracts And State

`agent-contracts.ts` owns protocol constants, identifiers, view models, commands,
and the exhaustive `AgentUiEvent` union. `agent-reducer.ts` is the sole replay and
live-event projection. It ignores events for unknown sessions/runs where required
and preserves partial mutation evidence on cancellation.

`AgentBridgeClient` models method-level commands and `subscribe()`. The fake
bridge under `features/agent/testing` schedules immutable scripted events,
supports AbortController cancellation, and never reaches provider/chart code.
Switching bridge implementations must not change components or reducer behavior.

## Layout

`AgentWorkbenchShell.vue` uses two CSS grid tracks: a minmax chart track and one
explicit panel track. A dedicated separator implements pointer and keyboard
resizing and clamps the width. Below 880 px, the panel is anchored to the shell's
right edge as a drawer with responsive max width; the chart layout no longer
shrinks. The shell accepts an optional panel-width persistence adapter so
Electron can use its preload-backed store while browser hosts can use local
storage or no store.

The panel is a bounded work surface, not a decorative card. Only repeated tool
items and the confirmation/error modal use framed card styling. Icon actions use
the existing Tabler/unplugin-icons stack and native tooltips/ARIA labels.

## Streaming And Focus

The store batches text delta projection on a short animation-frame/timer window
before updating the visible assistant message and polite live region. The reducer
still receives the exact ordered events. Confirmation requests focus the first
decision, errors focus their notice, and completion focuses the final status.

## Test Shape

- Reducer unit tests replay fixtures and assert state rather than text snapshots.
- Vue component tests inject the fake bridge and exercise keyboard, draft, Stop,
  confirmation, retry, and shared-shell resize behavior.
- Electron E2E launches the packaged test shell, selects deterministic scenarios,
  asserts DOM state and dimensions, and captures compact/desktop screenshots.

## Compatibility

The later Native bridge implements `AgentBridgeClient`; Electron supplies that
bridge to the same shell used by the browser host. Fake scenario controls are
enabled only by a build/test flag and never ship as provider capability.
Contract breaking changes increment `AGENT_UI_PROTOCOL_VERSION` and update all
fixtures/tests together.
