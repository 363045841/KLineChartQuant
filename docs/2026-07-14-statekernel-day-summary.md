# 2026-07-14 工作纪要：StateKernel 收敛与 Manager 投影化

## 总览

`feat/vue-reactivity-scroll` 上，围绕 **StateKernel 作唯一 SSOT** 做了一天重构：增量加载修 bug、几何公式并一处、状态归位、不可变边界，最后把 SubPane / Comparison / Indicator 的 Manager 改成只做 runtime 投影。

| 指标 | 数值 |
|------|------|
| 提交 | 8 |
| 文件 | 49 |
| diff | +4786 / −1200 |
| 范围 | 主要在 `packages/core`，另加 3 份计划/修复文档 |

```
72efc05..0da16bb  (2026-07-14)
```

---

## 提交时间线

| 时间 | Hash | 说明 |
|------|------|------|
| 12:59 | `72efc05` | 增量加载：hint 不显示 + prepend 滚动漂移 |
| 15:13 | `2a9a51a` | `contentGeometry` 纯函数，几何只算一遍 |
| 15:15 | `8787a36` | Effect 隔离、状态归属、R/W 边界 |
| 15:16 | `c9db388` | StateKernel 合规修复计划 |
| 15:43 | `38fcb7e` | 主图指标 Map 进 StateKernel |
| 16:02 | `93ca890` | 不可变快照 + 多字段 batch |
| 16:06 | `f1c1bcd` | comparison 颜色阴影、subPane 双写拆掉 |
| 17:27 | `0da16bb` | Manager 只投影，不持业务状态 |

---

## 1. 增量加载（`72efc05`）

### 现象

1. **首次 prepend 后 `klc-incremental-load-hint` 不出现**  
   `_dataSyncEffect` 同时盯 `data` 和 `loading`，用 `DataChange` 引用去重时，`loading=false` 会提前 return，连 `loading` 订阅都丢了。

2. **第二次 prepend 视口漂**  
   DOM effect 先写 `scrollLeft` 再写 `contentWidth`，浏览器 clamp 后 scroll 事件又写回 signal。

### 改法

- data / loading 各一个 effect；hint 只在 loading 变 false 时 flush。
- `contentWidth` / `maxScrollLeft` / 对外 `scrollLeft` 改成 `computed()`。
- scroll 输入统一走 Action clamp；DOM 先 width 后 `scrollLeft`，不读回。
- 细节见 `docs/incremental-load-fix.md`。

---

## 2. 几何只算一处（`2a9a51a`）

### 问题

`viewportState`、`ScrollCompensator`、load-hint 各自算 leftBuffer / contentWidth / maxScrollLeft，公式或输入一不一致就静默漂。

### 改法

新建 `packages/core/src/engine/state/contentGeometry.ts`：

- `computeLeftLoadBufferWidth`
- `computeContentWidth`
- `computeMaxScrollLeft`

`viewportState` 只调这些；`ScrollCompensator` 读 kernel viewport。`kGap` 在 viewport 里由 `kWidth + dpr` 派生，去掉 `_dprPlaceholder` 环。

---

## 3. Effect 隔离与状态归位（`8787a36` → `38fcb7e`）

按 AGENTS.md 五条：

1. 只经 Actions 写 WritableSignal  
2. 派生用 `computed()`  
3. 对外 `ReadonlySignal`  
4. effect 只出不进（DOM/WebGL）  
5. 多字段写 `batch()`

### 迁进 Kernel 的子状态

| 模块 | 内容 |
|------|------|
| `optionsState` | Chart options（原 chart 内 `_optionsSignal`） |
| `comparisonState` | 对比股 colors / loading |
| `indicatorState` | 主图指标 `ReadonlyMap` |
| `paneState` | pane specs / ratios（layout 只投影） |
| `subPaneState`（后续提交） | 副图条目 |

### 其它

- `chartDataManager`：data/loading 订阅 → Action，副作用挪出 batch。
- `createSubState`：运行时剥掉 `.set`（`asReadonlySignal`）。
- dispose/reset 多字段写统一 `batch()`。
- `chartViewportManager.viewportSignal` 真正只读。

计划：`docs/superpowers/plans/2026-07-14-statekernel-compliance-remediation.md`。

---

## 4. 不可变边界（`93ca890`）

### 问题

类型上是 `ReadonlySignal`，运行时 Map / params / entries 还能改；pane ratios/specs、buffer key/data/loading 可能先发出半成品。

### 改法

- `immutable.ts`：`immutableMap`、`freezeRecord`、`deepFreezeSnapshot`。
- 对外 Map / params / entries 冻结或拷贝。
- pane layout、buffer 多字段一次 `batch`。
- SubPane entries 发不可变快照；getter 返回拷贝。

---

## 5. Manager 只做投影（`f1c1bcd` + `0da16bb`）

业务状态全进 Kernel；Manager 只挂/卸 runtime。

```
Public API
    │
    ▼
Kernel Actions  ──write──►  WritableSignal（内部）
    │
    ▼
ReadonlySignal / computed（对外）
    │
    ▼
effect / reconcile  ──project──►  renderer / layer / buffer / DOM
```

| 角色 | 可以 | 不可以 |
|------|------|--------|
| StateKernel | 业务状态、Actions、batch | DOM/WebGL |
| Manager | 读 kernel，挂卸 runtime | 持业务 Signal / 业务 Map |
| Projection | 丢了重建 | 当真相源回写 |

### ComparisonManager

- 删 `_specs`、颜色 hooks 阴影、`appliedSpecs`。
- `specs` 从 `data.symbols` 派生（`slice(1)`）；可写的只有 colors / loading。
- `reconcile()` 对 kernel specs 和 buffer；`clearAll()` 只清 runtime。
- loading 由 data/loading 订阅里 `recomputeLoading()`。

### SubPaneManager

- 删 `_entriesSignal` 和 create/remove/replace/updateParams。
- `mounted` 只留 `SubPaneResources + projectionKey`。
- `reconcile()`：key 不变跳过；同 renderer 名则 `updateParams`，否则 mount 新再 unmount 旧。
- 任一步失败：invalidate / unmount 旧的，删 mounted，方便重试。
- key 用 `stableConfig()`，区分 `NaN` / `±Infinity` / `-0` / `null` / `undefined`。

### ChartIndicatorManager

- 公开 API 只写 kernel。
- 一个 effect：`paneSpecs + paneRatios + mainIndicators + subPanes`，顺序 pane → main → sub。
- 重复 `createSubPane`：已存在 no-op；**mount 失败后再调同一 API** 用 `replace` 强制重发状态。
- 主图 projection key 同样区分非有限数。

### 配套

| 组件 | 改动 |
|------|------|
| `RendererPluginManager` | `transaction()` 合并 invalidate |
| `ChartPaneLayout` | `projectState(specs, ratios)` 单向投影 |
| `Chart.destroy` | 先停 indicator projection → 清 runtime → `kernel.dispose()` |
| `DataBuffer` | `_requestVersion` 丢过期 fetch |
| `FetchScheduler` | `_generation`；reset 后排队任务不跑、不卡 loading |

### 写入约束

`deepFreezeSnapshot` 只要 JSON-like：

- 行：plain object / array / number / string / boolean / null  
- 不行：function / bigint / symbol / Map / Date / 循环引用  

`subPaneState.replace` **params 相同也 write**，专门给 mount 失败后的同 API 重试用。

---

## 6. 测试

### 补了什么

- `subPaneState`：不可变、equal upsert 不通知、拒非 JSON、replace 强制 rewrite  
- `subPaneManager`：reconcile、mount 失败可重试、factory 抛错清旧、非有限数 key  
- `chartIndicatorManager`：state-driven、destroy 停投影、mount 失败重试、NaN vs Infinity  
- `fetchScheduler`：reset 作废排队任务  
- `dataBuffer`：过期 fetch 丢弃  
- comparison / contentGeometry / scrollCompensator / indicator / pane / dataState 边界  

### 收口时结果

```text
Focused suite: 29/29 passed
Core build:    tsc -p tsconfig.build.json OK
Full core:     1736 passed, 6 failed（webglRenderer / jsdom canvas，旧问题）
```

另：`vue-tsc` 的 baseUrl deprecation 配置问题，跟这轮无关。

---

## 7. 文件地图

```
packages/core/src/engine/state/
  chartStateKernel.ts      # 根 Actions：setSymbols / createSubPane / replaceSubPane …
  subPaneState.ts          # 副图业务（新建）
  indicatorState.ts        # 主图指标（新建）
  comparisonState.ts       # colors/loading + 派生 specs
  optionsState.ts
  contentGeometry.ts
  immutable.ts
  viewportState.ts

packages/core/src/engine/
  subPaneManager.ts
  indicators/chartIndicatorManager.ts
  data/comparisonManager.ts
  data/chartDataManager.ts
  layout/chartPaneLayout.ts
  chart.ts

packages/core/src/data/
  dataBuffer.ts
  fetchScheduler.ts

packages/core/src/foundation/
  reactivity/signal.ts
  plugin/rendererPluginManager.ts
```

---

## 8. 之后写代码时记住

1. 改业务状态 → Kernel Action，别在 Manager 里 `signal.set`。  
2. 改画面 → 改 kernel，让 effect/reconcile 投影，别手搓「再同步一遍 renderer」。  
3. 投影失败 → 清 runtime，保持可重试；别留下 kernel 有、画面无、再调 API 也不动的半状态。  
4. params 用 JSON-like；非有限数靠 stable key，别拿裸 `JSON.stringify` 当 identity。  
5. 异步 fetch 要有 generation / version；reset 后旧任务别写 loading / 数据。

---

## 9. 没做

- WebGL/jsdom 那 6 个失败  
- vue-tsc `baseUrl`  
- 旧 Manager 双写 API 兼容（按「最佳方式重构、不兼容」做的）  
- 没发 npm，没合 main  

---

## 10. 可以接着干

1. 把这轮相关 package test 从 warn-only 提成必过子集。  
2. 扫 Vue / preview 有没有还在 mutate 旧 Manager 内部结构。  
3. inflight fetch 测试若 flaky，统一 fake timers 或 await generation。  
4. 计划文档里没勾的 checkbox，对照本纪要勾完归档。
