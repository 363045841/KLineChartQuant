# Timeshare Minute Indicators

## Decision

Indicators that declare `timeshare` or `fiveDayTimeShare` in `@Indicator.dataViews` are rendered in those views. MACD, RSI, BOLL, and KDJ use the existing K-line calculators with a shared 1min bar request.

## Data Flow

The timeshare buffer remains the source for the primary price, average-price, and volume renderers. Once it is ready, `ChartDataManager` requests a bounded 1min bar series for the same instrument. `IndicatorScheduler` calculates on that series, then projects every indicator series to the displayed timeshare indexes by normalized minute timestamp.

Missing minutes remain `undefined`; no previous value is carried forward. This prevents a suspension, session gap, or source gap from being rendered as an invented indicator value.

## Consequences

Existing indicator calculators retain their OHLC contract and run only once. The renderer continues to consume a series aligned to the primary frame geometry. Every indicator sub-pane resolves its Y-axis range from its render state in `ChartRenderer`, independent of the active chart mode. Switching to a timeshare view preserves every user indicator instance and pane; an indicator is rendered whenever its `dataViews` declaration supports the active view.

When a provider cannot return 1min bars, the primary timeshare and VOL continue to render while these indicators have no projected values.
