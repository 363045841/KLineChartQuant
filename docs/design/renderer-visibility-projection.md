# Renderer Visibility Projection

## Decision

`ChartStateKernel.activeRenderers$` is the declarative source for managed renderer layers. Each entry contains the renderer plugin name and Scene layer ID. `Chart` owns one effect that diffs the previous and desired layer IDs and updates visibility only for that managed set.

## Scope

The projection includes the active primary renderer, main indicator data layers with the shared legend layer, and each active sub-pane's data, scale, and title layers. It never installs or removes plugins.

## Rationale

Plugin factories can allocate resources and must not run from `computed()`. Indicator metadata therefore exposes pure renderer-name resolvers for data, scale, and title resources. The scale resolver uses the plugin's real `indicatorKey` naming convention, preventing the former `_scale_` versus `Scale_` mismatch.

## Lifecycle

`ChartIndicatorManager` and `SubPaneManager` still install, configure, and uninstall renderer resources. `TimeShareMode` changes business state only. No manager directly changes Scene layer visibility; this keeps runtime resource lifecycle separate from state-driven visibility.
