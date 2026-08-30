# Latest Price Line Mode Visibility

## Decision

`lastPriceLine` and `lastPriceLabelRegistrar` are mode-owned main-pane Indicators that declare
`dataViews: ['kline']`. The K-line mode creates their system instances, while comparison and
timeshare modes omit them.

## Rationale

The latest-price dashed line describes the primary K-line's final close and is not meaningful
when the pane presents normalized comparison series. It must follow the same declarative layer
visibility projection as `extremaMarkers`, rather than relying on a draw-time mode condition.

## Lifecycle

`ChartIndicatorManager` installs both layers from their Indicator definitions. `ChartStateKernel.activeRenderers$`
selects their visibility from active mode instances, so comparison never enables either latest-price renderer.

## Legend

Comparison legend contexts omit `currentBar`, so the K-line-specific O/H/L/C/Vol row is not
rendered by either the Canvas legend or external legend slots.
