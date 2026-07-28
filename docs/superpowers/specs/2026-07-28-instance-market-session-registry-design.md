# Instance Market Session Registry Design

## Goal

Make market identity part of the chart's unified symbol model and resolve time-share trading sessions through a chart-instance registry. Data-source-specific fields remain inside fetchers. Missing or unsupported market metadata must fail explicitly; the chart never guesses or falls back to A-share rules.

## Scope

- Add required `market: string` to the unified `SymbolSpec` model.
- Add a market-session registry owned by each Chart instance.
- Resolve the active time-share session from `SymbolSpec.market` before loading data.
- Add built-in CN, HK, and US session definitions to each instance unless the caller supplies replacements.
- Adapt only the gotdx fetcher/search boundary to produce unified market IDs.
- Do not infer market from symbol code, exchange, returned bars, or existing chart state.
- Do not add market normalization to other fetchers in this change. Their output must already provide a valid unified market or fail at the normalization boundary.

## Unified Model

```ts
export interface SymbolSpec {
  symbol: string
  market: string
  exchange?: string
  period?: string
  adjust?: string
  source?: string
  params?: DataSourceParams
  startDate?: string
  endDate?: string
  incremental?: boolean
}
```

`market` is a chart-domain identifier. `exchange` is display or venue metadata. `params` is private fetcher input. Neither `exchange` nor `params` may control chart behavior.

`SymbolInfo` and search results that can become a `SymbolSpec` also carry the normalized `market` value. Conversion into `SymbolSpec` validates it before calling `setSymbols`.

## Instance Registry

Each Chart creates its own `MarketSessionRegistry`. There is no mutable global registry.

```ts
interface MarketSessionRegistry {
  register(market: string, config: MarketSessionConfig): void
  getRequired(market: string): MarketSessionConfig
}
```

The registry validates non-empty market IDs and valid session configurations. `getRequired` throws a descriptive error for unknown IDs.

Each instance starts with CN, HK, and US definitions copied into its own registry. Instance registration may add or replace definitions without affecting another chart.

Chart creation options expose instance configuration:

```ts
type ChartMountOptions = {
  marketSessions?: Readonly<Record<string, MarketSessionConfig>>
  // existing options
}
```

Caller entries override built-ins only for that Chart instance.

## Time-Share Flow

`Chart.setSymbols` validates the primary symbol before changing mode or loading data:

1. Reject a missing or blank `SymbolSpec.market`.
2. For `period === 'timeshare'`, resolve the session with `registry.getRequired(spec.market)`.
3. Apply the resolved config to `TimeShareMode`.
4. Activate time-share mode and load the buffer.

Unknown markets throw before the request starts. The previous chart mode and session remain unchanged when validation fails.

K-line rendering does not consume session configuration, but all symbols still require `market` to preserve one complete data model.

## gotdx Normalization

gotdx search responses are normalized at the gotdx fetcher boundary:

- Main-market `params.market` values 0, 1, and 2 map to `market: 'CN'`.
- Extended `exchange: 'HK'` entries with supported gotdx Hong Kong categories map to `market: 'HK'`.
- Unsupported or contradictory gotdx metadata throws a descriptive normalization error.

The chart never reads gotdx `params.market`, `params.category`, or `params.kind`.

The gotdx time-share request continues to route privately:

- `params.category` uses `/api/ex/history-tick`.
- `params.market` uses `/api/stock/history-tick`.

Those parameters affect only network routing and are not chart market identity.

## Other Fetchers

No other fetcher receives source-specific mapping in this change. Any path that converts another fetcher's search result or configuration into `SymbolSpec` must require an already-normalized `market`; otherwise it throws before `setSymbols`.

This prevents silent partial support while keeping the implementation scope limited to gotdx.

## Errors

Failures are explicit and deterministic:

- Missing market: `SymbolSpec.market is required for <symbol>`.
- Unknown registry key: `Market session is not registered: <market>`.
- gotdx cannot normalize metadata: include symbol and relevant private params.
- Invalid custom session: reject during registry registration.

There is no CN default and no inference from `exchange` inside core.

## Testing

Use TDD for each behavior:

- Registry instances are isolated.
- Built-in CN, HK, and US sessions resolve correctly.
- Missing and unknown markets throw before fetching.
- HK time-share selects 330 one-minute slots and Hong Kong axis endpoints.
- Switching HK to CN replaces the active session correctly.
- gotdx main-market search normalizes to CN.
- gotdx Hong Kong search normalizes to HK.
- gotdx unsupported metadata throws.
- Existing gotdx category/market request routing remains covered.

Run focused core tests first, then the core package suite and root type-check relevant to changed public types.
