# Mode System Instances

## Decision

`indicatorState.instances` is the only source of truth for both user indicators and mode-owned
series. Each mode-owned instance has `source: 'mode'`.

## Mode Projection

- `kline` writes the `candle` main instance.
- `timeshare` writes the `timeShare` main instance and the `volume` sub instance in
  `timeshare_volume`.
- `ChartStateKernel.actions.setDataView()` updates data view, mode instances, and the
  `timeshare_volume` pane in one `batch()`.

## Boundaries

Core main-series layers are installed once and their visibility is projected from the active
instance set. The `timeShare` renderer only draws price and average lines. The volume renderer
owns all volume bars, including `TimeShareData`.

User indicator actions preserve `source: 'mode'` instances. Leaving timeshare removes only its
mode-owned instances and pane, preserving user indicators and panes.
