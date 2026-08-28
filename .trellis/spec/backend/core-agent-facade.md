# Core Agent Facade

## 1. Scope / Trigger

Use this contract whenever Electron, Web, Pi, MCP, or an SDK needs chart context
or deterministic indicator evidence. Consumers cross the public
`ChartController.agent` boundary; they must not import Core state or Agent
implementation paths.

## 2. Signatures

```ts
interface ChartAgentController {
  getContext(): ChartAgentContextSnapshot
  queryIndicator(input: IndicatorQueryInput): Promise<string>
}

interface ChartController {
  readonly agent: ChartAgentController
}
```

Stable imports are available from the package root, `./controllers`, and
`@363045841yyt/klinechart-core/agent`. The `./agent` runtime re-exports use
explicit `.js` extensions so the new subpath works in Node ESM and bundlers.

## 3. Contracts

`IndicatorQueryInput` contains a non-empty `definitionId`, optional finite
numeric `params`, optional inclusive finite `from`/`to`, and optional integer
`limit`. The default limit is 20 and the maximum is 2000.

`ChartAgentContextSnapshot` is a detached, deeply frozen plain object containing
`chartId`, instrument/source/period metadata, `dataRange`, nullable
`visibleRange`, numeric `activeIndicators`, and `dataRevision`.
Unavailable optional metadata is `null`; do not infer timezone or market.

`dataRevision` comes from the active `DataState` snapshot. Context reads and
indicator queries are read-only and must not advance it themselves.

## 4. Validation & Error Matrix

| Condition                                     | `KLineChartError.code`  |
| --------------------------------------------- | ----------------------- |
| Empty definition, invalid params/bounds/limit | `INVALID_ARGUMENTS`     |
| Valid range contains no active bar            | `OUT_OF_RANGE`          |
| Context has no data or query has non-bar data | `NO_DATA`               |
| Definition lacks a registered calculator      | `INDICATOR_NOT_FOUND`   |
| Data changes during both query attempts       | `DATA_REVISION_CHANGED` |

Callers branch on `code`, never on diagnostic message text. Public constants
come from `CHART_AGENT_ERROR_CODES`; internal query aliases point to that same
source of truth.

## 5. Good / Base / Bad Cases

- Good: capture `controller.agent.getContext()`, call `queryIndicator()`, and
  attach the observed data revision to the later tool envelope without parsing the
  returned compact text.
- Base: omit `limit`; Core returns at most 20 formatted entries while calculating
  against the full series for lookback correctness.
- Bad: import `engine/state/dataState`, parse Markdown with a regex, fabricate a
  numeric DTO, guess missing metadata, or write query output to a result pool.

## 6. Tests Required

- Unit: JSON serialization, nested immutability, detached params, range mapping,
  stable chart identity, and typed no-data.
- Query: runtime-invalid inputs, 20/2000 limits, empty range, missing calculator,
  one successful revision retry, and continuous revision failure.
- Integration: two real controllers have distinct IDs; custom data and a built-in
  indicator flow through the facade; read-only query preserves data revision.
- Package: Core build and strict publint pass; `./agent` direct Node ESM import
  and bundler type resolution pass; public declarations contain no `DataState`.

## 7. Wrong vs Correct

### Wrong

```ts
import { createIndicatorQuery } from '@363045841yyt/klinechart-core/src/features/agent'

const rows = parseMarkdown(await createIndicatorQuery(internals).queryIndicator(input))
```

This couples consumers to internal state and turns formatter text into an
unstable hidden schema.

### Correct

```ts
import { CHART_AGENT_ERROR_CODES } from '@363045841yyt/klinechart-core/agent'

const observed = controller.agent.getContext()
const content = await controller.agent.queryIndicator(input)
```

The adapter keeps `content` opaque and records `observed.dataRevision` in its
own typed tool-result envelope.
