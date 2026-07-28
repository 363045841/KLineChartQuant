# Symbol Chip Fetch Error Title Design

## Goal

When the main symbol K-line fetch fails with an explicit Effect error, the Vue symbol chip must show the failure reason on hover via the native `title` attribute. Users should not need the console to understand why the warning icon appears.

## Scope

- Main-symbol K-line fetch only.
- Propagate explicit Effect failures: network errors, HTTP/fetcher `FETCH_FAILED`, timeouts, missing source, and other rejected fetch promises after retries.
- Empty successful responses (`[]`) remain non-fatal warnings and do not set chip error reason.
- Native browser `title` only; no custom tooltip component.
- Out of scope for this change: TimeShareBuffer, comparison-symbol chips, search-result errors, custom popup UI.

## Problem

Today:

1. `DataBuffer` catches fetch failures and only clears inflight state.
2. Vue `symbolStatus` becomes `'error'` when loading ends with no data.
3. `SymbolSelector` shows a warning icon for `error === true`.
4. Chip `title` is always the symbol display name, never the failure reason.

The warning icon therefore has no user-facing explanation.

## Design

### Core: buffer-owned last error

`DataBuffer` owns a writable error signal and exposes it as readonly:

```ts
readonly lastError: ReadonlySignal<string | null>
```

Rules:

- On explicit fetch failure after Effect retry/timeout, set `lastError` to a human-readable message derived from the thrown value.
- Prefer `Error.message` when available; otherwise `String(error)`.
- On successful merge of any fetch result (including empty `[]`), clear `lastError` to `null`.
- On `setSymbol`, `setInlineData`, and `dispose`, clear `lastError` to `null`.
- Stale-request failures must not overwrite the current request's error or clear a newer request's success.

`KLineBuffer` / `DataBufferLike` surface the same readonly signal so consumers do not cast to the concrete class.

### Core: chart surface

`ChartDataManager` and `Chart` expose:

```ts
readonly dataError: ReadonlySignal<string | null>
```

This reads the active primary K-line buffer's `lastError`. When no active K-line buffer exists, the value is `null`.

No global EventBus path. Error state remains part of the data buffer lifecycle.

### Vue: chip title

`KLineChart` subscribes to `ctrl.dataError` (or equivalent controller exposure) and keeps a local `symbolErrorMessage: string | null`.

Pass-through:

1. `KLineChart` → `TopToolbar` as `symbolErrorMessage`
2. `TopToolbar` → `SymbolSelector` as `errorMessage`

`SymbolSelector` chip title:

- If `error && errorMessage`: use `errorMessage`
- Else: keep current `displayText`

Warning icon continues to use the existing boolean `error` prop. This change does not invent a second visual state machine; it only supplies the reason text for hover.

`symbolStatus === 'error'` may still be inferred from loading end without data for icon visibility. The title reason must come from `lastError` / `dataError`, not a hard-coded generic string, when an explicit Effect failure exists.

If the icon is shown because data is empty but `lastError` is null (successful empty fetch), title may remain the symbol display name. Empty data is not an explicit Effect failure.

## Message quality

Do not invent new marketing copy in the UI layer. Surface the existing failure message from the Effect/fetcher boundary, for example:

- `[gotdx] stock/kline-by-date failed: 500 Internal Server Error`
- `[DataBuffer] source is required for symbol "..."`
- timeout messages produced by Effect timeout

If a message is empty after normalization, fall back to `加载失败`.

## Testing

- DataBuffer unit tests:
  - failed fetch sets `lastError` to the error message
  - successful fetch clears `lastError`
  - `setSymbol` / `setInlineData` clear `lastError`
  - empty successful `[]` does not set `lastError`
  - stale rejected request does not clobber a newer successful request
- Vue wiring test or component-level assertion:
  - when error message is provided, chip `title` equals that message
  - when not in error, chip `title` remains display text

## Non-goals

- Custom styled tooltip
- Localizing/rewriting every fetcher message
- Comparison or timeshare error chips
- Changing empty-data policy back to hard failure
