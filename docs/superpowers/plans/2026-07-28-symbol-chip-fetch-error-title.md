# 品种 Chip 拉取错误 Title 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主品种 K 线 Effect 显式失败时，品种 chip 悬停通过原生 `title` 显示失败原因。

**Architecture:** `DataBuffer` 持有 `lastError` 只读信号；失败写入、成功/换品种/dispose 清空。`ChartDataManager`/`Chart`/`ChartController` 暴露 `dataError`。Vue 订阅后把文案传到 `SymbolSelector` 的 `title`。

**Tech Stack:** TypeScript、Effect、vitest、Vue 3 SFC

**Spec:** `docs/superpowers/specs/2026-07-28-symbol-chip-fetch-error-title-design.md`

---

### Task 1: DataBuffer.lastError

**Files:**
- Modify: `packages/core/src/data/dataBufferTypes.ts`
- Modify: `packages/core/src/data/dataBuffer.ts`
- Test: `packages/core/src/data/__tests__/dataBuffer.test.ts`

- [ ] **Step 1: 写失败测试**

在 `dataBuffer.test.ts` 增加（`defaultSpec` 补 `market: 'CN'` 若测试需要）：

```ts
it('records lastError when fetch fails after retries', async () => {
  const fetcher: DataFetcher = async () => {
    throw new Error('[gotdx] stock/kline-by-date failed: 500')
  }
  buffer.setFetcher(fetcher)
  buffer.setSymbol({ ...defaultSpec, market: 'CN' })

  await vi.waitFor(() => expect(buffer.loading()).toBe(false), { timeout: 10_000 })
  expect(buffer.lastError()).toBe('[gotdx] stock/kline-by-date failed: 500')
})

it('clears lastError on successful fetch', async () => {
  let fail = true
  const fetcher: DataFetcher = async () => {
    if (fail) throw new Error('offline')
    return [makeKLine(Date.now())]
  }
  buffer.setFetcher(fetcher)
  buffer.setSymbol({ ...defaultSpec, market: 'CN' })
  await vi.waitFor(() => expect(buffer.lastError()).toBe('offline'), { timeout: 10_000 })

  fail = false
  buffer.setSymbol({ ...defaultSpec, market: 'CN', symbol: 'sh.600001' })
  await vi.waitFor(() => {
    expect(buffer.loading()).toBe(false)
    expect(buffer.data().data.length).toBe(1)
  })
  expect(buffer.lastError()).toBeNull()
})

it('does not set lastError for successful empty data', async () => {
  buffer.setFetcher(async () => [])
  buffer.setSymbol({ ...defaultSpec, market: 'CN' })
  await vi.waitFor(() => expect(buffer.loading()).toBe(false))
  expect(buffer.lastError()).toBeNull()
})

it('clears lastError on setInlineData', async () => {
  buffer.setFetcher(async () => {
    throw new Error('boom')
  })
  buffer.setSymbol({ ...defaultSpec, market: 'CN' })
  await vi.waitFor(() => expect(buffer.lastError()).toBe('boom'), { timeout: 10_000 })
  buffer.setInlineData([makeKLine(Date.now())])
  expect(buffer.lastError()).toBeNull()
})
```

- [ ] **Step 2: 跑测试确认 RED**

```bash
pnpm exec vitest run src/data/__tests__/dataBuffer.test.ts
```

Expected: FAIL — `lastError` 不存在

- [ ] **Step 3: 最小实现**

`dataBufferTypes.ts` 的 `DataBufferLike` / `KLineBuffer` 增加：

```ts
readonly lastError: ReadonlySignal<string | null>
```

`dataBuffer.ts`：

```ts
private _lastError = createSignal<string | null>(null)

get lastError(): ReadonlySignal<string | null> {
  return this._lastError
}
```

- `setSymbol` / `setInlineData` / `dispose`：`this._lastError.set(null)`
- `_fetchAndMerge` 成功 merge 后：`this._lastError.set(null)`
- `.catch(err)`：若 `requestVersion === this._requestVersion`，  
  `this._lastError.set(err instanceof Error && err.message ? err.message : err ? String(err) : '加载失败')`

注意：`FetchScheduler.run` 的 catch 目前丢弃 err；需把 `run` 的 reject 原因传到外层 catch，或在 task 内 try/catch 写入 lastError。优先在 `_fetchAndMerge` 的 task 内 try/catch：

```ts
this._scheduler
  .run(async () => {
    try {
      const incoming = await fetchEffect()
      if (disposed() || requestVersion !== this._requestVersion) return
      this._lastError.set(null)
      // merge ...
    } catch (err) {
      if (disposed() || requestVersion !== this._requestVersion) return
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : err != null && String(err).trim()
            ? String(err)
            : '加载失败'
      this._lastError.set(message)
      this._inflightBoundary = null
      this._pendingRequestStartTs = null
    }
  })
```

- [ ] **Step 4: 跑测试确认 GREEN**

```bash
pnpm exec vitest run src/data/__tests__/dataBuffer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/data/dataBuffer.ts packages/core/src/data/dataBufferTypes.ts packages/core/src/data/__tests__/dataBuffer.test.ts
git commit -m "feat(core): record DataBuffer lastError on fetch failure"
```

---

### Task 2: Chart / Controller 暴露 dataError

**Files:**
- Modify: `packages/core/src/engine/data/chartDataManager.ts`
- Modify: `packages/core/src/engine/chart.ts`
- Modify: `packages/core/src/controllers/types.ts`
- Modify: `packages/core/src/controllers/createChartController.ts`
- Test: `packages/core/src/engine/data/__tests__/chartDataManager.incrementalLoad.test.ts` 或新增小测试

- [ ] **Step 1: 写失败测试**

在 incrementalLoad 或新建测试中：失败 fetcher 后 `manager`/`chart` 的 `dataError.peek()` 等于错误 message；成功后为 null。

- [ ] **Step 2: RED**

- [ ] **Step 3: 实现**

`ChartDataManager`：

```ts
get dataError(): ReadonlySignal<string | null> {
  const buf = this.getActiveDataBuffer()
  return (buf?.lastError ?? createSignal<string | null>(null)) as ReadonlySignal<string | null>
}
```

注意：active buffer 切换时，若直接返回 buffer 信号引用会变。更稳妥：在 `dataState` 增加 `error: string | null`，在 `publishBufferSnapshot` / loading/data 事件时同步 `buf.lastError.peek()`；或 ChartDataManager 维护桥接 signal，在 bindActiveBuffer 时订阅 `buf.lastError`。

推荐桥接（与 loading 镜像一致）：

- `bindActiveBuffer` 额外 `buf.lastError.subscribe` → 写入 `_dataState.actions.setError(...)`  
- 或独立 `_errorSignal` 在 chartDataManager 内

最小路径：`Chart.dataError` 每次 `get` 返回 active buffer 的 `lastError`；Vue 在 `dataLoading` 订阅回调里 `peek()` 一次即可。但 `ChartController` 需要稳定 `ReadonlySignal`。

稳定方案：

```ts
// chartDataManager
private _dataError = createSignal<string | null>(null)

private syncDataErrorFromBuffer(buf: KLineBuffer | TimeShareBuffer | null): void {
  const err =
    buf && 'lastError' in buf
      ? ((buf as KLineBuffer).lastError?.peek() ?? null)
      : null
  this._dataError.set(err)
}

// 在 publishBufferSnapshot / bind / handle loading|data 后调用 sync
get dataError(): ReadonlySignal<string | null> {
  return this._dataError
}
```

`Chart`：`get dataError() { return this.dataManager.dataError }`  
`ChartController`：`readonly dataError: ReadonlySignal<string | null>`  
`createChartController`：`dataError: chart.dataError`

- [ ] **Step 4: GREEN + commit**

```bash
git commit -m "feat(core): expose chart dataError signal"
```

---

### Task 3: Vue chip title 接线

**Files:**
- Modify: `packages/vue/src/components/SymbolSelector.vue`
- Modify: `packages/vue/src/components/TopToolbar.vue`
- Modify: `packages/vue/src/components/KLineChart.vue`
- Test: 新增 `packages/vue/src/components/__tests__/SymbolSelector.errorTitle.test.ts`（若 vue 包已有 component test 模式）；否则用纯函数/小测验证 title 计算，或 mount SymbolSelector

- [ ] **Step 1: SymbolSelector 失败测试**

```ts
// title 计算：error && errorMessage ? errorMessage : displayText
it('uses errorMessage as title when error is true', () => {
  // mount SymbolSelector with error=true, errorMessage='offline', symbol display
  // expect button title === 'offline'
})
```

- [ ] **Step 2: RED → 实现 props `errorMessage?: string`，`:title="error && errorMessage ? errorMessage : displayText"`**

- [ ] **Step 3: TopToolbar 增加 `symbolErrorMessage?: string` 传给 SymbolSelector**

- [ ] **Step 4: KLineChart 订阅 `ctrl.dataError`，维护 `symbolErrorMessage`，传给 TopToolbar**

在现有 `unsubscribeDataLoading` 旁：

```ts
symbolErrorMessage.value = ctrl.dataError.peek()
const unsubscribeDataError = ctrl.dataError.subscribe(() => {
  symbolErrorMessage.value = ctrl.dataError.peek()
})
```

destroy 时 unsub。

- [ ] **Step 5: GREEN + commit**

```bash
git commit -m "feat(vue): show fetch error reason on symbol chip title"
```

---

### Task 4: 回归验证

- [ ] `pnpm --filter @363045841yyt/klinechart-core test`
- [ ] `pnpm --filter @363045841yyt/klinechart-core build`
- [ ] 相关 vue 测试（若有）
- [ ] 提交中文设计/计划文档（若尚未提交）

```bash
git add docs/superpowers/specs/2026-07-28-symbol-chip-fetch-error-title-design.md docs/superpowers/plans/2026-07-28-symbol-chip-fetch-error-title.md
git commit -m "docs: 中文 chip 错误 title 设计与实现计划"
```
