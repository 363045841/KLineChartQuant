# Agent Workspace UI

## Goal

Deliver one shared Web/Vue Agent workspace and stable Renderer event contract
from PRD FR-001/FR-004 before integrating Pi or a real provider. Electron's
Renderer and the browser preview must compose the same shared UI; the fake
runtime must exercise the same view states and commands that later Main/IPC
integration will use.

## Confirmed Baseline

- `packages/desktop-electron/src/App.vue` currently renders only `<KlineChart />`.
- Electron already uses context isolation, no Node integration, and sandboxing.
- No desktop component-test or Playwright Electron harness exists.
- The workspace consumes the existing Vue chart directly; this task must not
  change chart internals or couple the UI to Pi event types.

## Requirements

### UI Contract

- Define a versioned, exhaustive `AgentUiEvent` union and method-level
  `AgentBridgeClient` interface owned by the shared Vue Renderer feature.
- UI code consumes only normalized app events and view models, never Pi events,
  raw IPC, provider payloads, or hidden model reasoning.
- Define session, message, tool call, confirmation, context, provider status,
  usage, error, and run state view models needed by the complete Alpha UI.

### Workspace Layout

- Render KLineChart and Agent panel as equal top-level work areas.
- Panel defaults to 420 px, resizes from 360 through 640 px, collapses without
  cancelling work, and becomes an overlay drawer below the desktop breakpoint.
- Chart keeps a usable minimum width and receives normal ResizeObserver-driven
  resizing without manual canvas scaling.
- Header exposes session switch/new/rename/delete affordances, selected model,
  connection status, current scope, panel close, and settings entry.

### Timeline And Tool States

- Render user and assistant messages, streamed assistant deltas, compact action
  summaries, tool cards, structured confirmations, recoverable errors, evidence
  metadata, and usage summary.
- Cover waiting, running, success, failure, cancelled, partial, confirmation,
  confirmed, rejected, completed, and undone states with icon/text, not color
  alone.
- Tool cards summarize bounded inputs/results and expose locate/undo/retry only
  when the contract says the action is available.

### Composer And Empty/Setup States

- Provide the four PRD empty-state prompts and preserve a selected prompt/draft.
- Enter sends, Shift+Enter inserts a line break, and the primary action changes
  to Stop while a run is active.
- Provide read-only mode and symbol/period/range context chips.
- If no provider is configured, sending opens provider setup without dropping
  the draft. Provider setup in this task is a shell/fake state only.
- Steering while running is visibly disabled and the pending draft is retained.

### Accessibility And Responsiveness

- Every command is keyboard reachable and icon-only buttons have accessible
  names/tooltips.
- Streamed text uses a throttled polite live region; status is never color-only.
- Confirmation, error, and run completion establish deliberate focus targets.
- Text must not overlap or overflow at 360 px panel width, compact window size,
  desktop, or wide desktop.

### Fake Runtime

- Provide scripted deterministic scenarios for initial setup, streaming,
  successful read, successful mutation, confirmation accepted/rejected,
  recoverable failure, stop with partial completion, retry, and undo.
- Commands and events are asynchronous and abortable enough to exercise the UI
  state machine without embedding business logic in components.

## Acceptance Criteria

- [x] Panel opens, closes, resizes within 360-640 px, and switches to a small
      window drawer while KLineChart remains mounted and usable.
- [x] Fake scenarios demonstrate every required message/tool/run/error state
      through the stable app event contract.
- [x] Draft preservation, Enter/Shift+Enter, Stop, retry, read-only mode,
      confirmation, undo, and empty prompt flows work by keyboard and pointer.
- [x] UI imports no Pi package and reads no raw `ipcRenderer` event.
- [x] Electron and Web preview render the exported shared Agent workbench shell;
      neither host keeps a private copy of the Agent components or layout logic.
- [x] Component tests cover the event reducer and primary state transitions.
- [x] Playwright Electron smoke covers launch, resize, stream, Stop, and drawer
      behavior with `retries: 0`.
- [x] Vue package and Desktop Renderer typecheck/build pass with no new lint errors.
- [x] Screenshot/DOM inspection at compact and desktop sizes shows no overlap,
      clipped controls, unreadable text, nested cards, or blank chart region.

## Out Of Scope

- Real Pi runtime, provider networking or credentials, persistent sessions,
  canonical chart-tool execution, and real undo. Later children replace the fake
  bridge behind the same contract.
- PRD P1 bidirectional chart-object location and rich usage/cost dashboards.

## Open Questions

None. The source PRD fixes layout, event, interaction, and scope defaults.
