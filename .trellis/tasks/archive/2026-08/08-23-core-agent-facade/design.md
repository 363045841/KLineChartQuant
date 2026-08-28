# Core Agent Facade - Technical Design

## Public Boundary

`ChartController` gains a readonly `agent` member. Stable types and error-code
constants live behind `features/agent/index.ts`, are re-exported from the root
and controller type surfaces, and are mapped by `package.json` to `./agent`.
The construction helper and query implementation remain internal.

```text
Web / Electron Renderer / future SDK
                  |
                  v
        ChartController.agent
          |              |
          v              v
   immutable context   compact text
          |              |
          +------ Core --+
                 |
       ChartStateKernel/DataState
          (never exported)
```

## Context Construction

The facade reads one active-buffer snapshot and the controller's current spec,
viewport, and indicator projections synchronously. It builds new plain objects,
filters indicator params to finite numbers, and freezes nested objects/arrays.
`dataRange` uses the active series timestamps; `visibleRange` translates the
viewport's half-open index range into inclusive first/last timestamps after
clamping to loaded data.

Metadata comes from the active selection/current `SymbolSpec`. Missing optional
metadata is `null`. Timezone is emitted only where Core has an authoritative
active-series value; it is not guessed from market or host timezone.

Each controller creates one UUID-backed `chartId`. A controller-owned revision
tracker observes Agent-relevant state signals and monotonically increments on
changes after initial construction. Data changes retain the existing independent
`DataState.dataRevision`; context reads do not mutate either counter.

## Query Semantics

`createIndicatorQuery` continues to own normalization, full-series calculation,
revision retry, and compact formatting. Validation occurs before calculator
execution. A valid bounded range must contain at least one active bar. The
calculator receives the whole series to preserve lookback; only the formatter
receives `from`, `to`, and `limit`.

The facade delegates directly and returns the resulting string unchanged. No
adapter in this task parses Markdown or semantic text. Tool metadata envelopes
will be built by the canonical registry/runtime child from context snapshots and
observed revisions.

## Error Contract

Agent codes are append-only members of the shared `KLineChartErrorCode` union and
are exposed through a frozen `CHART_AGENT_ERROR_CODES` constant:

| Failure                                 | Code                    |
| --------------------------------------- | ----------------------- |
| malformed query or reversed time bounds | `INVALID_ARGUMENTS`     |
| valid range with no matching bars       | `OUT_OF_RANGE`          |
| absent/non-bar active data              | `NO_DATA`               |
| missing calculator                      | `INDICATOR_NOT_FOUND`   |
| data changes during both attempts       | `DATA_REVISION_CHANGED` |

Messages remain diagnostic only. Tests and downstream recovery branch on codes.

## Compatibility

The addition is non-breaking: existing controller members and root imports stay
unchanged, while `agent` and `./agent` are additive. Existing compact output and
the two-attempt retry policy remain intact. Internal legacy constants may alias
the new codes so there is one behavior source.

## Rollback

The change is isolated to the Core package and can be reverted without data or
schema migration. Removing the additive export and controller member restores
the previous package surface; no persisted state is introduced.
