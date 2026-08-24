# Core Agent Facade

## Goal

Expose the chart's minimum sufficient Agent context and deterministic indicator
query through a stable `ChartController.agent` facade that Electron, Web, Pi,
and future SDK adapters can consume without importing Core internals.

## Source Requirements

- Own PRD v1.0 FR-005 and FR-006 and the Core slice of FR-016.
- Preserve the existing compact semantic indicator text contract.
- Provide the PR-02 deliverable described in source PRD section 21.

## Requirements

### R1. Stable Public Facade

- Every `ChartController` exposes a stable `agent: ChartAgentController` member.
- `ChartAgentController` provides `getContext(): ChartAgentContextSnapshot` and
  `queryIndicator(input: IndicatorQueryInput): Promise<string>`.
- The package exposes a public `@363045841yyt/klinechart-core/agent` subpath with
  only stable facade types and Agent error codes.
- Root and controller type exports describe the same facade without exposing
  `DataState`, calculators, result pools, or internal Agent module paths.

### R2. Serializable Context Snapshot

- `getContext()` returns chart identity, instrument/source/period metadata,
  loaded and visible timestamp ranges, numeric active-indicator parameters,
  and observed `chartRevision` and `dataRevision` values.
- The snapshot and every nested collection are detached from mutable engine
  objects, JSON-serializable, and immutable to consumers.
- `chartId` is stable for one controller instance and distinct across instances.
- `chartRevision` is monotonic when Agent-relevant chart state changes;
  `dataRevision` is the active data state's monotonic revision.
- An absent or empty active data series throws a typed `NO_DATA` error instead
  of returning an empty or partially fabricated snapshot.
- Optional metadata unavailable from the active chart is represented as `null`,
  never inferred from unrelated defaults.

### R3. Bounded Indicator Query

- Queries accept `definitionId`, finite numeric params, optional inclusive
  `from`/`to` timestamps, and an optional integer `limit`.
- The default limit remains 20 and the hard limit remains 2000.
- Calculation uses the complete active K-line series so indicator lookback is
  preserved, while formatting applies the requested range and limit.
- The method returns the existing compact semantic text directly. It must not
  parse the text, fabricate a numeric DTO, or write to an Agent result pool.
- One data revision change during calculation retries against the newest
  coherent snapshot; continued churn fails deterministically.

### R4. Stable Failures

- Invalid definitions/params/limits/time ordering fail as
  `INVALID_ARGUMENTS`.
- A requested valid time range containing no active bars fails as
  `OUT_OF_RANGE`.
- Missing or non-K-line data fails as `NO_DATA`.
- An unavailable indicator calculator fails as `INDICATOR_NOT_FOUND`.
- Data that changes throughout both allowed attempts fails as
  `DATA_REVISION_CHANGED`.
- Failures use `KLineChartError` and append-only public error-code constants;
  callers never branch on message text.

## Acceptance Criteria

- [x] Given a controller with loaded bars, `agent.getContext()` returns the
      correct data/visible ranges, numeric indicators, and observed revisions,
      and survives `JSON.stringify` without leaking mutable references.
- [x] Given two controller instances, their `chartId` values differ and remain
      stable for each instance.
- [x] Given no active bars, `getContext()` and `queryIndicator()` fail with the
      documented typed error instead of returning empty content.
- [x] Given chart-state and data-state changes, the corresponding revisions are
      monotonic and unchanged by read-only snapshot calls.
- [x] Given valid indicator requests with omitted, boundary, and maximum limits,
      compact text is returned with default 20 and maximum 2000 behavior.
- [x] Given invalid parameters, limits, ranges, unregistered indicators, and
      continuous data revision churn, each branch returns its stable code.
- [x] Given one mid-query data revision change, the query retries once and
      returns output from a coherent latest snapshot.
- [x] Package build and export checks prove consumers can import the facade from
      the root/controllers surfaces and `@363045841yyt/klinechart-core/agent`.
- [x] Source and tests contain no compact-text reverse parser, result-pool write,
      or public `DataState` export.

## Out Of Scope

- Pi/MCP tool result envelopes, duration/request metadata, and registry schemas.
- Renderer/Main IPC, provider integration, persistence, policy, mutations,
  postconditions, idempotency, or undo.
- Structured indicator value DTOs or raw K-line transfer to a model.
- Exact visible-range mutation; that belongs to the chart-tools child task.

## Open Questions

None. The parent PRD and source PRD section 25 resolve the required defaults.
