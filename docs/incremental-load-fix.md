# Incremental Load Fix — Bug Causes and Fix Methods

## 问题一：首次增量加载后 klc-incremental-load-hint 不显示

### Bug 原因

packages/core/src/engine/data/chartDataManager.ts 中的 `_dataSyncEffect` 同时依赖 `buf.data()` 和 `buf.loading()`，但 `_lastDataChange` 去重判断发生在读取 `buf.loading()` 之前：

```
const dataChange = buf.data()
if (dataChange === this._lastDataChange) return  // 提前返回
const loading = buf.loading()
```

时序链条：

1. DataBuffer 的 `_loadingSignal.set(true)` 先设置 loading 为常真。
2. `_store.merge()` 更新 data Signal，effect 执行并记录 increment load
   批次（`recordIncrementalLoad`）。因 loading 为 true，不 flush 提示。
3. FetchScheduler finally 把 `_loadingSignal.set(false)`。
4. effect 再次执行，但 DataChange 引用未变，提前 `return`，既不更新
   loading 也不 flush；同时 effect 每次执行时清除并重新收集依赖，
   本次未读到 `buf.loading()`，丢失了 loading 订阅。
5. `scheduleIncrementalLoadHintFlush` 始终不会调用。

此外，`pendingIncrementalLoadCount` 和 `pendingIncrementalLoadLeftBufferWidth`
是两个独立的 Signal，应当合并为单一不可变快照。

### 修复方法

1. data 和 loading 各走独立的 effect：
   - `_dataSyncEffect` 仅跟踪 `buf.data()`，处理 setData 和
     `onBufferDataChanged`。
   - `_loadingSyncEffect` 仅跟踪 `buf.loading()`，更新 loading 信号，
     loading 从 true 转为 false 时是 flush 增量提示的唯一入口。
2. `pendingIncrementalLoadCount` 和 `pendingIncrementalLoadLeftBufferWidth`
   合并为单个 `IncrementalLoadBatch` 不可变快照（`{ count, leftBufferWidth }`），
   写入仍经 StateKernel Action。
3. 补充回归测试，验证首次增量加载后 `klc-incremental-load-hint` DOM 挂载、
   opacitiy 为 1、geometry 正确、pending 计数器为 0。

### 影响文件

- packages/core/src/engine/data/chartDataManager.ts
- packages/core/src/engine/state/dataManagerState.ts
- packages/core/src/engine/data/__tests__/chartDataManager.incrementalLoad.test.ts

---

## 问题二：第二次增量加载后视图位置偏移

### Bug 原因

packages/core/src/engine/state/viewportState.ts 的 `scrollDomEffect`
按以下顺序写 DOM：

```
container.scrollLeft = scrollLeft       // 先
scrollContent.style.width = contentWidth // 后
```

prepend 后补偿后的 scrollLeft 可能超过旧 scrollContent 宽度。浏览器先
将 scrollLeft clamp 到旧 scrollWidth 的最大值；随后才扩展内容宽度。这个
被 clamp 的 DOM 值又经 chartViewportManager 的 scroll event listener 回写
StateKernel 的 scrollLeft Signal，导致视图被错误固定在 clamp 位置。

第一次 prepend 后 scrollContent 已扩展到位，后续 prepend 有足够余量，
浏览器不再 clamp，因此不再复现。

第二个问题是同一个 effect 中调用 `syncFromDomScroll()` 回写 Signal，
违反 StateKernel 的 Effect Isolation 原则——effect 不应反向修改 state。
第三个问题是 `contentWidth` 由命令式回调 `_contentWidthProvider` 提供，
而非 StateKernel 中的 computed，导致派生逻辑泄漏在 effect 中，
且必须额外读取 `dataLength$` 才能触发 effect 重新求值。
第四个问题是 ChartRenderer RAF 中也直接写 `scrollContent.style.width`，
存在两个 DOM writer 竞争写入。

### 修复方法

1. 引入私有 WritableSignal `requestedScrollLeft` 作为唯一滚动输入点，
   公开 `scrollLeft` 改为 computed，推导为
   `Math.max(0, Math.min(requestedScrollLeft, maxScrollLeft))`。
2. `contentWidth` 与 `maxScrollLeft` 改为 computed 纯函数：
   KLine 模式等价于 ScrollCompensator.getContentWidth；
   timeshare 模式为单屏宽、无左缓冲。
3. `scrollTo` Actions 与 `syncFromDomScroll` 共用 `setRequestedScrollLeft`
   私有函数，统一 clamp 输入并归一化非有限值。
4. `scrollDomEffect` 只单向写 DOM：先设 `scrollContent.style.width`，
   再设 `container.scrollLeft`；不读 DOM 也不写 StateKernel Signal。
5. 移除 `_contentWidthProvider` 命令式回调。
6. 移除 ChartRenderer RAF 中的旧 scrollContent.width 写入，
   viewportState 成为唯一 DOM writer。
7. 补充测试覆盖：派生 width/maxScroll 随 dataLength/options/DPR/period
   变化；scrollTo/syncFromDomScroll 共用统一 clamp；NaN 输入归一化；
   数据收缩后 signal 自动收敛；DOM 写入顺序 wifth-first then scroll。

### 影响文件

- packages/core/src/engine/state/viewportState.ts
- packages/core/src/engine/state/chartStateKernel.ts
- packages/core/src/engine/viewport/chartViewportManager.ts
- packages/core/src/engine/chart.ts
- packages/core/src/engine/render/chartRenderer.ts
- packages/core/src/__tests__/stateKernel.test.ts
- packages/core/src/__tests__/stateKernel.types.test.ts
