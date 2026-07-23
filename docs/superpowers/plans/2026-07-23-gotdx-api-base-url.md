# gotdx API Base URL Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all frontend gotdx requests use `VITE_GOTDX_API_BASE_URL`, defaulting to `http://127.0.0.1:8080`.

**Architecture:** Keep URL resolution local to `packages/core/src/data/gotdx.ts`. Read the Vite environment at request time so tests can override it without module reloading, normalize trailing slashes, and append the existing endpoint paths unchanged.

**Tech Stack:** TypeScript, Vite `import.meta.env`, Vitest, Fetch API.

## Global Constraints

- Use environment variable `VITE_GOTDX_API_BASE_URL`.
- Default to `http://127.0.0.1:8080` when the variable is absent.
- Remove trailing slashes before appending endpoint paths.
- Do not modify BaoStock, TradingView, Go backend, or Vite proxy targets.

---

### Task 1: Make gotdx base URL configurable

**Files:**
- Modify: `packages/core/src/data/gotdx.ts:34` and all gotdx fetch URL construction sites.
- Test: `packages/core/src/data/__tests__/gotdx.test.ts`.

**Interfaces:**
- Produces a private `getBaseUrl(): string` helper that returns the normalized configured URL.

- [ ] **Step 1: Add tests for default and overridden URLs**

In `packages/core/src/data/__tests__/gotdx.test.ts`, add environment cleanup to the existing `beforeEach` or `afterEach`, then cover both cases through the existing fetcher:

```ts
afterEach(() => {
  vi.unstubAllEnvs()
})

it('uses the default gotdx API base URL', async () => {
  fetchMock.mockResolvedValue(jsonResponse([]))
  const definition = getRegisteredFetcher('gotdx')

  await definition?.fetcher('gotdx', {
    symbol: '600519',
    period: 'daily',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    adjust: 'none',
    exchange: 'SH',
    params: { market: 1 },
  })

  expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8080/api/stock/kline-by-date')
})

it('uses and normalizes VITE_GOTDX_API_BASE_URL', async () => {
  vi.stubEnv('VITE_GOTDX_API_BASE_URL', 'http://gotdx.test:9090///')
  fetchMock.mockResolvedValue(jsonResponse([]))
  const definition = getRegisteredFetcher('gotdx')

  await definition?.fetcher('gotdx', {
    symbol: '600519',
    period: 'daily',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    adjust: 'none',
    exchange: 'SH',
    params: { market: 1 },
  })

  expect(fetchMock.mock.calls[0]?.[0]).toBe('http://gotdx.test:9090/api/stock/kline-by-date')
})
```

- [ ] **Step 2: Run the focused tests and verify the new override test fails**

Run: `pnpm --filter @363045841yyt/klinechart-core test -- gotdx.test.ts`

Expected: the default test passes and the override test fails because the implementation still uses the hard-coded `http://127.0.0.1:8080` URL.

- [ ] **Step 3: Implement request-time URL resolution**

Replace the hard-coded constant with:

```ts
const DEFAULT_BASE_URL = 'http://127.0.0.1:8080'

function getBaseUrl(): string {
  return (import.meta.env.VITE_GOTDX_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}
```

Use `getBaseUrl()` for the four existing request groups: history tick, symbol search, extended K-line, and stock K-line. Preserve every endpoint path and request body.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm --filter @363045841yyt/klinechart-core test -- gotdx.test.ts`

Expected: all gotdx tests pass, including the default and overridden base URL tests.

- [ ] **Step 5: Run the core package verification**

Run: `pnpm --filter @363045841yyt/klinechart-core test`

Expected: the core package test suite passes with no unrelated failures.

- [ ] **Step 6: Inspect the final diff**

Run: `git diff -- packages/core/src/data/gotdx.ts packages/core/src/data/__tests__/gotdx.test.ts docs/superpowers/specs/2026-07-23-gotdx-api-base-url-design.md docs/superpowers/plans/2026-07-23-gotdx-api-base-url.md`

Expected: only the documented URL configuration, focused tests, design, and plan changes are present.
