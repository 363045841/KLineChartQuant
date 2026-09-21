# 指标计算链路迁移到实例实例链路

## 背景

旧计算链路由 `IndicatorScheduler`（主线程 facade）+ `IndicatorRuntime`（inline）+ 旧 Worker 协议
（`indicator.worker.ts` / `workerProtocol.ts`）组成，结果再经 `indicatorResultState` 落盘。
它按「指标类型 + pane」组装配置，无法表达「同一指标多实例、同参数去重计算」。

本次迁移把计算与投影统一交给 `engine/indicators/instances/`：实例是配置身份，`calculationKey`
是去重身份，结果池按 `instanceId` 保存，pane 只拥有可重建的渲染投影。

## 接线路径

```text
ChartDataManager.updateIndicatorData(data, range, revision, displayTimestamps?)
  -> ChartIndicatorManager.requestCompute()
  -> createInstanceCalculationScheduler.compute({ dataRevision, timestamps, data })
       -> executor.setData(data, dataRevision)
       -> executor.execute(plan, dataRevision)      # Worker 优先，失败降级 inline
       -> expandIndicatorCalculationOutputs(plan, outputs)
  -> onCommit(pool)
       -> projectPoolToDisplayTimestamps(pool)      # 仅分时有 displayTimestamps
       -> composeRenderStates(pool)                 # 逐 instanceId 生成投影
       -> scheduleDraw() + onResultsApplied()
  -> createRenderStateReader().get(instanceId)      # renderer / scale renderer / 图例
```

## 实例来源：Kernel 配置单向投影

`Kernel.indicator`（`indicatorState`）仍是 UI 与持久化的配置 SSOT。`ChartIndicatorManager` 在每个
状态 effect 中把 Kernel 实例单向投影为 `instances/` 的计算实例：

- `instanceId`、`paneId` 原样保留；
- `definitionId` 取静态定义注册表的 `metadata.name`（计算身份）；
- 计算参数按 `runtime.defaultParams` 补齐并规范化为 JSON 值，保证 `calculationKey` 稳定；
- 没有 `runtime` 的展示型指标（如成交量）不进入计算链路。

指标定义变更不能作为参数 patch，`syncPipeline` 采用「删建」，保证 `definitionId` 与计算身份一致。

## 版本与调度语义

- `calculationRevision`：实例启用集合、定义或计算参数变化时由实例 API 递增，触发重新生成计划。
- `requestId` 门控：调度器只提交最新请求，且提交前校验实例 `calculationRevision` 未变化。
- `presentationRevision`：pane 变化只重建投影，不触发计算。

## Worker 与 inline

`ChartIndicatorManager` 优先构造模块 Worker（`instances/worker/instanceIndicator.worker.ts`），构造失败
直接使用 inline。Worker 异步失败（`ready` 拒绝或 `execute` 报错）时，把执行器切换为 inline 并重试当前
数据；inline 再失败只记录日志，避免降级循环。

## 主图范围与成交量

- 主图 pane 范围来自「已启用主图实例 + 结果池」，逐实例 `computeInstanceMainIndicatorPriceRange` 后取并集。
- 成交量没有 calculator，其渲染状态由 `composeVolumeRenderState` 直接合成，按 Kernel 成交量实例的
  `instanceId` 写入投影。

## 服务注册

`ChartIndicatorManager` 注册两个 PluginHost 服务：

- `INDICATOR_INSTANCE_STATE_SERVICE`：`IndicatorRenderStateReader`，renderer 按 `instanceId` 读取投影；
- `INDICATOR_INSTANCE_CATALOG_SERVICE`：`IndicatorInstanceCatalog`，主图图例按实例枚举并读取标题。

## 删除的旧链路

- `engine/indicators/scheduler.ts`
- `engine/indicators/indicator.worker.ts`
- `engine/indicators/workerProtocol.ts`
- `engine/state/indicatorResultState.ts`
- `engine/indicators/indicatorRegistry.ts`
- `indicatorRuntime.ts` 中的 `IndicatorRuntime`、`findFirstReadyIndex`（保留 `CALCULATOR_MAP` 与
  `createWorkerCompute` 供新 Worker 使用）
- `indicatorMetadata.resolveStateKey` 与自动 `applyResult` 投影

`state/*StateKey`、`createIndicatorStateKey` 与 `@Indicator.stateKey` 元数据已随测试迁移完成一并删除；
`state/*` 仅保留 renderer 状态类型与 `EMPTY_*` 常量。`soa.ts` 无生产引用，已与其测试一并移除。
