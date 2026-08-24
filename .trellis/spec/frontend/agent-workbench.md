# Shared Agent Workbench

## 1. Scope / Trigger

Use this contract when changing the Agent Renderer UI, adding a host for it, or
implementing a bridge that supplies Agent events. Electron's Renderer is a Web
host: it must consume the feature in `packages/vue/src/features/agent` rather
than own a second set of Agent components or layout logic.

## 2. Signatures

The shared boundary is method-level and event-driven:

```typescript
interface AgentBridgeClient {
  openSession(sessionId: string): Promise<AgentSessionSnapshot>
  startRun(input: {
    sessionId: string
    prompt: string
    readOnly: boolean
  }): Promise<{ runId: string }>
  cancelRun(runId: string): Promise<void>
  subscribe(listener: (event: AgentUiEvent) => void): () => void
  // Session, confirmation, retry, undo, and provider methods are defined in agent-contracts.ts.
}

interface AgentPanelWidthStorage {
  load(): number | null | undefined
  save(width: number): void
}
```

Hosts render the common shell and supply the chart through its named slot:

```vue
<AgentWorkbenchShell :bridge="bridge" :panel-width-storage="storage">
  <template #chart><KlineChart /></template>
</AgentWorkbenchShell>
```

## 3. Contracts

- `AgentUiEvent.protocolVersion` must equal `AGENT_UI_PROTOCOL_VERSION`.
- Sequenced events are applied only when `event.sequence > state.lastSequence`.
  Session snapshots carry `lastSequence`; subscribe and buffer before loading a
  snapshot so replay and concurrent live events cannot render twice.
- The reducer in `agent-reducer.ts` is the only projection from normalized
  events to Renderer view state.
- Shared Agent files must not import Electron, raw `ipcRenderer`, Pi runtime
  types, provider payloads, or chart internals.
- Hosts own bridge construction and host storage. The shell owns panel open,
  resize, persistence calls, and compact drawer behavior.
- Panel width defaults to 420 px and is clamped to 360-640 px.
- The chart surface owns 16 px vertical gutters and uses the shell background.
  It may set `--kmap-chart-width/height: 100%`, but must not force every slotted
  child to 100% height because that consumes the gutter.
- Compact mode is based on the shell container width below 880 px, not only the
  browser viewport, so embedded Web hosts behave correctly.
- Closing the panel hides it without unmounting `AgentWorkspace` or cancelling
  the current run.

## 4. Validation & Error Matrix

| Condition                            | Required behavior                                   |
| ------------------------------------ | --------------------------------------------------- |
| Event protocol version differs       | Ignore the event and preserve state                 |
| Event belongs to an inactive run     | Ignore the stale event                              |
| Event sequence is already applied    | Ignore it and preserve the replay cursor            |
| Provider is not configured on send   | Open settings and preserve the draft                |
| Stored width is non-finite or absent | Use the 420 px default                              |
| Stored width is outside 360-640 px   | Clamp before rendering                              |
| Storage adapter throws               | Continue with in-memory UI state                    |
| Shell width is below 880 px          | Disable resizing and use an anchored overlay drawer |

## 5. Good / Base / Bad Cases

- Good: Electron and the browser preview import the exported shell, inject
  different storage adapters, and render the same component tree.
- Base: a browser host omits `panelWidthStorage`; resize still works for the
  current page lifetime.
- Bad: copying `AgentWorkspace.vue` into the Electron package, reading raw IPC
  in a component, or branching the component tree on fake versus native bridge.

## 6. Tests Required

- Reducer unit tests must assert ordered streaming, confirmation, partial
  cancellation, retry, undo, stale-run isolation, and replay/live deduplication.
- Component tests must assert draft preservation, Enter/Shift+Enter, Stop,
  read-only mode, confirmation focus, retry, and shell resize/collapse behavior.
- Electron E2E must use `retries: 0`, verify 360/640 px bounds, exercise compact
  drawer close/reopen, assert 16 px chart gutters match the shell background,
  and assert that chart canvas pixels remain nonblank.
- Build both the Vue/Web host and Electron Renderer after changing exports,
  slots, bridge signatures, or layout CSS.

## 7. Wrong vs Correct

### Wrong

```typescript
// Electron-only UI reads transport details directly.
ipcRenderer.on('pi:event', (_event, payload) => updateComponent(payload))
```

### Correct

```typescript
// A host adapter normalizes transport events; shared UI sees only the contract.
const unsubscribe = bridge.subscribe((event: AgentUiEvent) => {
  state.value = reduceAgentUiEvent(state.value, event)
})
```
