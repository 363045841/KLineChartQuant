# Instance Market Session Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strict chart-instance market session resolution and normalize gotdx symbols into the unified market model.

**Architecture:** `SymbolSpec.market` is required. Each Chart owns a `MarketSessionRegistry`; time-share activation resolves its session before changing chart state. gotdx search converts private market/category metadata into `CN` or `HK`; core never examines fetcher params.

**Tech Stack:** TypeScript, Vitest, Effect, pnpm workspace

---

### Task 1: Market Session Registry

**Files:**
- Create: `packages/core/src/engine/market/marketSessionRegistry.ts`
- Create: `packages/core/src/engine/market/__tests__/marketSessionRegistry.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] Write tests proving built-ins resolve, unknown IDs throw, invalid configs throw, and two registries are isolated.
- [ ] Run the focused test and confirm failure because the registry module is missing.
- [ ] Implement `MarketSessionRegistry`, built-in CN/HK/US entries, validation, and `getRequired`.
- [ ] Export the registry and market session types from core.
- [ ] Run the focused test and confirm it passes.

### Task 2: Strict Unified Symbol Market

**Files:**
- Modify: `packages/core/src/controllers/types.ts`
- Modify: all repository `SymbolSpec` and `SymbolInfo` construction sites reported by type-check.
- Test: `packages/core/src/engine/market/__tests__/marketSessionRegistry.test.ts`

- [ ] Add compile/runtime tests showing blank market is rejected.
- [ ] Make `market` required on `SymbolSpec` and `SymbolInfo`.
- [ ] Update fixtures and explicit inline/custom symbol construction with a deliberate market; do not infer from exchange or code.
- [ ] Run `pnpm type-check` and resolve only missing unified-market construction errors.

### Task 3: Chart Instance Integration

**Files:**
- Modify: `packages/core/src/controllers/types.ts` (`ChartMountOptions`)
- Modify: `packages/core/src/controllers/createChartController.ts`
- Modify: `packages/core/src/engine/chart.ts`
- Test: `packages/core/src/engine/modes/__tests__/timeShareMode.test.ts` or a focused Chart test

- [ ] Write failing tests proving HK symbols select `HK_MARKET_SESSION`, unknown markets throw before fetch, and two Chart registries do not share overrides.
- [ ] Add `marketSessions` to mount options and instantiate one registry per Chart.
- [ ] In `Chart.setSymbols`, validate market and resolve/apply the time-share session before `setActiveMode` and data loading.
- [ ] Run focused tests and confirm pass.

### Task 4: gotdx Market Normalization

**Files:**
- Modify: `packages/core/src/data/gotdx.ts`
- Modify: `packages/core/src/data/types.ts`
- Test: `packages/core/src/data/__tests__/gotdx.test.ts`

- [ ] Write failing tests for main-market to `CN`, HK category entries to `HK`, and unsupported metadata rejection.
- [ ] Extend `SearchResult` with required unified `market`.
- [ ] Normalize the raw gotdx response inside `searchGotdx`; preserve private params unchanged.
- [ ] Run gotdx tests and confirm pass.

### Task 5: UI Search Propagation

**Files:**
- Modify: `packages/vue/src/composables/useSymbolSearch.ts`
- Modify: Vue symbol conversion sites in `packages/vue/src/components/KLineChart.vue`
- Test: `packages/vue/src/composables/__tests__/useSymbolSearch.test.ts`

- [ ] Write failing tests proving `market` survives catalog/search selection into `SymbolSpec`.
- [ ] Propagate the already-normalized field without deriving it from exchange or params.
- [ ] Run Vue focused tests and confirm pass.

### Task 6: Verification

- [ ] Run `pnpm --filter @363045841yyt/klinechart-core test`.
- [ ] Run `pnpm --filter @363045841yyt/klinechart test`.
- [ ] Run `pnpm type-check`.
- [ ] Run `pnpm test:packages` if focused suites and type-check pass.
- [ ] Inspect diffs in both repositories and report any unrelated existing changes without modifying them.
