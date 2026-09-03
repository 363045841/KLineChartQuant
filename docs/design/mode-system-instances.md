# Mode System Instances

## Decision

`indicatorState.instances` is the only source of truth for both user indicators and mode-owned
series. Each mode-owned instance has `source: 'mode'`.

## Mode Projection

- `kline` writes the `candle` main instance.
- `timeshare` writes only the `timeShare` main instance.
- `ChartStateKernel.actions.setDataView()` updates only the data view and mode-owned main
  instances in one `batch()`; it never creates, removes, or relayouts user indicator panes.

## Boundaries

Core main-series layers are installed once and their visibility is projected from the active
instance set. The `timeShare` renderer only draws price and average lines. The volume renderer
owns all volume bars, including `TimeShareData`.

User indicator actions preserve `source: 'mode'` instances. Switching views replaces only the
mode-owned main instance; supported user indicators and their panes remain unchanged.
