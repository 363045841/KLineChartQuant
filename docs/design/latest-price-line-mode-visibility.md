# Latest Price Line Mode Visibility

## Decision

`lastPriceLine` is a mode-owned main-pane Indicator that declares `dataViews: ['kline']`.
The K-line mode creates its system instance, while comparison and timeshare modes omit it.

## Rationale

The latest-price dashed line describes the primary K-line's final close and is not meaningful
when the pane presents normalized comparison series. It must follow the same declarative layer
visibility projection as `extremaMarkers`, rather than relying on a draw-time mode condition.

## Lifecycle

`ChartRenderer` still installs the line layer once. `ChartStateKernel.activeRenderers$` selects
its visibility from the active mode instances, so switching into comparison hides the existing
layer and switching back to K-line restores it without recreating renderer resources.

## Legend

Comparison legend contexts omit `currentBar`, so the K-line-specific O/H/L/C/Vol row is not
rendered by either the Canvas legend or external legend slots.
