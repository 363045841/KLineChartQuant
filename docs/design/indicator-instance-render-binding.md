# 指标实例渲染绑定

## 背景

指标结果已收敛为「按 `instanceId` 保存的实例结果池」（`packages/core/src/engine/indicators/instances/`）。
旧渲染链路按 `resolveStateKey(meta.stateKey, paneId)` 寻址：同一指标在同一个 pane 开多个实例时，
它们的 render state 会写到同一个 key，互相覆盖；不同 pane 又必须重复计算。

本决策把渲染寻址从「指标类型 + pane」改为「实例 ID」，让结果池成为渲染的唯一事实来源。

## 身份

| 标识                    | 作用                             | 是否进入 calculator |
| ----------------------- | -------------------------------- | ------------------- |
| `instanceId`            | 图表上的一次启用实例             | 否                  |
| `calculationKey`        | `definitionId + 计算参数 + 上下文` | 是（去重身份）      |
| `paneId`                | 实例所在绘图区                   | 否                  |

渲染只认 `instanceId`。`paneId` 只决定投影落在哪个 pane，不参与状态寻址。

## 渲染读取契约

`RenderContext.indicatorStateReader` 的读取键由 `stateKey` 改为 `instanceId`：

```ts
interface IndicatorRenderStateReader {
  get<T = unknown>(instanceId: string): T | undefined
}
```

每个指标 renderer 与 scale renderer 由 `SubPaneManager` / 主图挂载时注入自己的 `instanceId`，
绘制时只读取该实例的投影，不再通过 `resolveStateKey` 推导 key，也不再通过
`PluginHost.getService('indicatorScheduler')` 反查元数据。

`resolveStateKey`、`createIndicatorStateKey`、`createXxxStateKey(paneId)` 不再参与指标结果寻址。

## 注入方式

- `IndicatorRendererOptions` / `IndicatorScaleRendererOptions` 增加 `instanceId`。
- 各指标自己的 renderer options（如 `RSIRendererOptions`）增加 `instanceId`。
- `createSubIndicatorRenderer` 把 `instanceId` 透传给 `definition.rendererFactory`。
- 主图实例由主图挂载路径注入 `instanceId`；主图图例需要读取多个实例，按实例列表逐个
  `reader.get(instanceId)`。

## 标题信息

`GetTitleInfoFn` 增加 `instanceId` 参数，`paneTitle` 用所属 pane 的实例 ID 调用。
标题读取的也是该实例的投影，不再按 `paneId` 推导 state key。

## 结果池与投影

```text
实例结果池（instanceId -> 结果）
  -> 按实例投影（instanceId -> RenderState）
  -> 帧级 reader.get(instanceId)
  -> renderer / scale renderer
```

投影中同一 pane 的多个实例各自拥有独立条目；相同参数、不同 pane 的实例共享同一份计算结果引用，
但各自投影。

## 迁移约束

- 不保留按 `stateKey` 读取的兼容分支。
- `instanceId -> stateKey` 的反向映射不作为过渡手段。
- 旧 `indicatorState`、旧 `scheduler`、`stateComposer`、`visibleStateComposers` 在迁移完成后删除。
