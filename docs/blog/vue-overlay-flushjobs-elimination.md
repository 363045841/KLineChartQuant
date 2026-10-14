# 一次鼠标交互触发两次 Vue flushJobs：把高频交互从 VDOM 里拆出来

> 现象一句话版：在 5ms 帧预算下滚动 / 悬停 K 线，每一帧的 `requestAnimationFrame` 前后各出现一段 Vue `flushJobs`，合起来吃掉约 16% 的预算——但它们本来都不该存在。

这篇文章记录一次完整的性能排查与架构收敛：默认 K 线 tooltip、鼠标坐标、hover 光标、Pane 头部、主图图例，这些高频交互状态是如何一遍遍穿过 Vue VDOM 的，以及如何把它们逐条挪回「RAF 内直接更新 DOM」的路径。

---

## 一、现象：每一帧，Vue 被唤醒两次

对 K 线图做滚动或悬停时，用 Performance 录制，每帧的时序大致是：

```text
pointermove 事件任务
  └─ Vue flushJobs        ← 帧前第一段
requestAnimationFrame
  └─ Core 绘制、发布帧快照
  └─ Vue flushJobs        ← 帧后第二段
浏览器 layout / paint
```

在 5ms 帧预算下，前后两段合计约 0.79ms，接近预算的 16%。单看每次都不大，但它是**每帧固定发生**的，属于可以也必须消掉的结构性开销，而不是偶发抖动。

关键问题不是「某次 setProperty 很慢」，而是：**一次鼠标交互，为什么 Vue 被更新了两次？**

## 二、根因：一笔交互穿过两套调度器

拆开调用栈后，两段 `flushJobs` 的来源完全不同：

- **帧前那段**：`pointermove` 事件处理器里，把鼠标坐标写进了 Vue `ref`。事件任务结束时 Vue 排队一个微任务。
- **帧后那段**：Core 在 `requestAnimationFrame` 内完成绘制并发布帧快照，Vue 侧订阅了这些快照，再把状态写回 Vue `ref`。RAF 回调结束前又排一个微任务。

也就是说，**同一次鼠标移动，被拆成了「事件阶段」和「RAF 阶段」两次独立的 Vue 更新**。而这两次更新驱动的是同一批 UI：tooltip 位置、hover 光标、Pane 高亮。

核心矛盾在于：这些状态的高频性（每帧都变）和它们所在的位置（Vue VDOM）不匹配。Vue VDOM 的 diff 与 patch 是为「低频、语义化、可组合」的 UI 设计的；把它用在「每帧都在变的坐标和文本」上，就必然付出重复的队列与 patch 成本。

## 三、逐条收敛：高频状态离开 VDOM

思路很朴素：**高频路径只更新 Canvas 或直接写 DOM，Vue 只处理低频业务状态。** 逐条看我们在 KLineChart 里移出了什么。

### 3.1 默认 K 线 tooltip：直接订阅 kernel

默认 tooltip 的内容（开高低收、成交量等）本来就有一条「绕过 VNode」的直接 DOM 路径。我们把它的**显示与定位**也接上这条路径：

- 位置由 `interactionState` 快照直接写 `el.style.left / top`
- 内容按 `hoveredIndex` 增量更新 DOM 节点
- 不再有任何 Vue `ref` 参与默认 tooltip

于是默认 tooltip 完全从 VDOM 里消失。

### 3.2 鼠标坐标：普通变量

`pointermove` 里原本写 `mousePos.value`（Vue `ref`），每帧触发一次 flush。改成普通对象 `let mousePos` 后，只在「确实要移动 marker tooltip」时才去写 DOM。事件阶段不再产生 Vue 微任务。

### 3.3 hover 光标与 Pane 状态：classList / style 直写

`interactionState` 里 `isDragging`、`hoveredIndex`、`hoveredPaneBoundaryId` 这些字段原本整包写进 Vue `shallowRef`，让整个 `KLineChart` 模板进入更新队列。现在直接在订阅回调里：

```typescript
stage?.classList.toggle('is-dragging', next.isDragging)
container.style.cursor = next.hoveredIndex !== null ? 'pointer' : 'crosshair'
line.classList.toggle('is-active', line.dataset.paneId === next.hoveredPaneBoundaryId)
```

RAF 后只改 class 和 style，不再唤醒 Vue。

### 3.4 viewport：不再整包进入 Vue

滚动时 Core 每帧更新 `visibleFrom / visibleTo`。Vue 侧却订阅了整个 viewport 对象——即使页面真正用到的 `zoomLevel` 没变，对象引用每帧都是新的，照样触发一次 flush。

把整包订阅改成**按字段投影 + 值相等短路**：Vue 只订阅低频的 `zoomLevel`，`visibleFrom / visibleTo` 留在 Core。区间选择 overlay 需要跟随滚动时，才在「确实存在选区」时临时订阅 viewport。

```typescript
export function useControllerSignalValue(controllerRef, select, project, fallback) {
  // 订阅 Core 信号，仅当 project() 结果 Object.is 不等时才写 Vue ref
  const sync = () => {
    const next = project(signal.peek())
    if (Object.is(snapshot.value, next)) return
    snapshot.value = next
  }
}
```

### 3.5 主图图例：回到 Canvas

最后排查到残留的 `set textContent`，根因是预览页启用了 `#legend` 自定义 slot。图例的 OHLC、成交量、指标数值随 hover 每帧变化，Vue 就得每帧 patch 这些文本。

默认图例本来就有 Canvas 绘制路径，于是：

- 预览页移除 `#legend`，回到 Canvas 图例
- 对外暴露类型化配置对象 `legend`，控制 `visible` 与 `visibleIndicatorIds`
- `#legend` slot 保留给「确实需要完全自定义 DOM」的调用方，但作为显式的高频 opt-in

```vue
<KLineChart :legend="{ visible: true, visibleIndicatorIds: ['MA', 'BOLL'] }" />
```

## 四、边界：什么是「合理的高频开销」

把默认路径清干净之后，我们保留了两类「允许进 VDOM」的高频更新，作为调用方**显式选择**的 opt-in：

- `#kline-tooltip` / `#legend`：调用方要用 Vue 模板自定义这些 UI，就得接受高频 patch 成本。
- 区间选择 overlay：只有确实存在选区时才会临时订阅滚动。

原则是：**默认路径不付高频 VDOM 的账；调用方明确要自定义时才承担。** 高频渲染数据与低频业务/UI 状态不再共用一个组件更新边界。

## 五、沉淀下来的三条原则

1. **高频路径只更新 Canvas / DOM，别让状态穿过 VDOM。** 坐标、光标、hover、tooltip 这类每帧变化的状态，直接操作 DOM 是成本最低、也最符合渲染本质的做法。
2. **按字段订阅，而不是整包订阅。** 一个高频对象里往往只有低频字段被页面真正用到；值相等短路能挡住大量无意义的 Vue 无效刷新。
3. **把高频默认路径与高频 opt-in 分开。** 默认行为要快；扩展能力要显式。让调用方在「要快」和「要自由」之间自己选。

## 六、结语

这个问题的表象是「每帧多两段微任务」，本质是**高频交互状态被放在了错误的渲染层里**。修复不是压缩某次 patch 的时间，而是把状态搬到对的位置：默认路径直接操作 DOM，Vue 只处理真正需要它的事件。

---

*相关代码：KLineChartQuant（Canvas / WebGL / WebGPU 混合渲染的金融图表库），改动位于 `packages/vue` 的 KLineChart 组件与 `packages/core` 的主图图例渲染器。*
