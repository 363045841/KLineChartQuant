# PaneManager 领域边界

## Context

Pane layout state and sub-indicator state describe one user-visible object: a sub pane exists together with the indicator it renders. Previously, layout mutations could update `PaneSpec[]` separately from indicator instances, allowing an orphaned pane or an orphaned indicator projection.

## Decision

`PaneManager` is the only pane domain write boundary. Its actions are `create`, `update`, `remove`, `move`, `replaceContent`, `updateContent`, and `clear`.

`create`, `remove`, and `clear` use one `batch()` to publish the pane layout and indicator instance snapshots together. `ChartStateKernel.actions` does not expose pane mutations. `ChartPaneLayout` now receives snapshots through `projectState()` and retains only renderer/layout working data needed to paint the current frame.

The complete-layout importer is intentionally separate from ordinary Actions. It is used only when a controlled chart configuration is loaded and removes user-owned sub-indicator instances for panes omitted by that imported snapshot. It is not an Agent or UI mutation API.

## Consequences

Framework controllers expose the same pane Actions and no longer expose `createSubPane`, `replaceSubPaneIndicator`, `updatePaneLayout`, or pixel-delta `resizeSubPane` APIs. UI drag behavior remains an interaction concern and must translate its result to `PaneManager.actions.update`.

Agent tool registration is the next integration step: it must wrap a documented subset of `PaneManager.actions`, never duplicate their domain logic or mutate `PaneState`/`IndicatorState` directly.

## Agent Tools

The Agent sees indicators, not panes: `indicators_list` and `indicators_write` (add / update / move / remove / clear) address instances and express placement as `main` or `sub`. Pane allocation stays inside `PaneManager`, and `ChartPaneFacade` no longer exposes instance commands — only layout.

Agent inputs never include `instanceId`, `paneId` or `ordinal`; the domain allocates those identities and returns them.
