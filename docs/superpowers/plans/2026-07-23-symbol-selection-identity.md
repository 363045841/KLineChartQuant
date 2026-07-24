# Symbol Selection Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the chart UI independently select same-code symbols whose source, exchange, or request params differ.

**Architecture:** Reuse one canonical identity function for `SymbolSpec` and `SearchableSymbol`. The core comparison state and Vue comparison selector retain and exchange identity keys, while `symbol` remains the fetch/display field.

**Tech Stack:** TypeScript, Vue 3, Vitest.

## Global Constraints

- Identity is `[source, exchange, symbol, sorted(params)]`.
- Do not change search APIs or data-fetch request parameters.
- Keep source comments in Chinese when needed.

---

### Task 1: Define Core Symbol Identity

**Files:**
- Create: `packages/core/src/engine/data/symbolIdentity.ts`
- Modify: `packages/core/src/engine/data/chartDataManager.ts`
- Modify: `packages/core/src/engine/state/comparisonState.ts`
- Test: `packages/core/src/engine/data/__tests__/comparisonManager.test.ts`

**Interfaces:**
- Produces: `symbolSpecIdentityKey(spec: Pick<SymbolSpec, 'source' | 'exchange' | 'symbol' | 'params'>): string`.
- Consumes: `SymbolSpec` from `packages/core/src/controllers/types.ts`.

- [ ] **Step 1: Write failing tests for two comparison specs with `symbol: '000001'` and different `exchange` values.**

```ts
expect(controller.symbols.peek().slice(1)).toHaveLength(2)
expect(controller.comparisonColors.peek()).toHaveLength(2)
```

- [ ] **Step 2: Run the focused test and verify the duplicate is rejected under code-only comparison.**

Run: `pnpm --filter @363045841yyt/klinechart-core test -- comparisonManager.test.ts`

Expected: FAIL because only one `000001` comparison spec is retained.

- [ ] **Step 3: Implement `symbolSpecIdentityKey` by JSON serializing source, exchange, symbol, and sorted params; use it for comparison duplicate detection, removal, and color keys.**

```ts
export function symbolSpecIdentityKey(spec: SymbolIdentity): string {
  const params = Object.entries(spec.params ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return JSON.stringify([spec.source ?? '', spec.exchange ?? '', spec.symbol, params])
}
```

- [ ] **Step 4: Run the focused core test and verify both comparisons and distinct colors are retained.**

Run: `pnpm --filter @363045841yyt/klinechart-core test -- comparisonManager.test.ts`

Expected: PASS.

### Task 2: Carry Identity Through Vue Comparison Controls

**Files:**
- Modify: `packages/vue/src/composables/useSymbolSearch.ts`
- Modify: `packages/vue/src/components/CompareSymbolSelector.vue`
- Modify: `packages/vue/src/components/TopToolbar.vue`
- Modify: `packages/vue/src/components/KLineChart.vue`
- Test: `packages/vue/src/composables/__tests__/useSymbolSearch.test.ts`

**Interfaces:**
- Consumes: `symbolIdentityKey(item: SearchableSymbol): string`.
- Produces: comparison selector `add` and `remove` events keyed by the canonical symbol identity.

- [ ] **Step 1: Add a failing composable test proving same-code results with different exchanges remain distinct.**

```ts
expect(results.value.map(symbolIdentityKey)).toEqual([
  symbolIdentityKey(shenzhen000001),
  symbolIdentityKey(shanghai000001),
])
```

- [ ] **Step 2: Run the Vue focused test and verify code-only deduplication removes one candidate.**

Run: `pnpm --filter @363045841yyt/klinechart test -- useSymbolSearch.test.ts`

Expected: FAIL before replacing `uniqueSymbolsByCode`.

- [ ] **Step 3: Replace `uniqueSymbolsByCode` with identity-key deduplication. Use identity keys for `selected`, `comparisonColors`, display fallback filtering, selected styling, and remove events. Convert the removal key back to its matching `SymbolItem` in `KLineChart.vue`, then pass the complete `SymbolSpec` to the controller.**

```ts
const selectedSet = computed(() => new Set(props.selected ?? []))

function toggleSymbol(item: SymbolItem) {
  const key = symbolIdentityKey(item)
  if (selectedSet.value.has(key)) emit('remove', key)
  else emit('add', item)
}
```

- [ ] **Step 4: Run the focused Vue test and verify both candidates are rendered and can be independently addressed.**

Run: `pnpm --filter @363045841yyt/klinechart test -- useSymbolSearch.test.ts`

Expected: PASS.

### Task 3: Verify Cross-Package Behavior

**Files:**
- Modify: only files from Tasks 1 and 2 if verification finds type errors.

- [ ] **Step 1: Run core and Vue package tests.**

Run: `pnpm --filter @363045841yyt/klinechart-core test && pnpm --filter @363045841yyt/klinechart test`

Expected: PASS.

- [ ] **Step 2: Run package type checks.**

Run: `pnpm --filter @363045841yyt/klinechart-core lint:types && pnpm --filter @363045841yyt/klinechart lint:types`

Expected: PASS.
