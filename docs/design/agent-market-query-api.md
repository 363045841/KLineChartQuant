# Agent 与 UI 统一行情查询 API

## 背景

图表加载此前通过 `ChartDataManager -> DataBuffer -> SourceRouter` 取数，而 Agent 只能查询当前图表已加载的快照。两条入口会使任意品种的无状态行情查询依赖图表选择、视口和渲染生命周期。

## 决策

在 `ChartAgentController` 上直接提供并以 `@Tool` 注册 `queryBars`、`queryTimeShare` 与 `queryTimeShareRange`。UI 直接调用这些公开方法，Agent 从同一个注册表调用它们；不建立 Agent 专用服务或适配层。

每个 API 都以独立请求参数调用由同一 `MarketDataProviderRegistry` 构造的 `SourceRouter`，并只返回可序列化的领域结果、实际来源和品种描述。查询不会读取或写入当前图表选择、StateKernel、指标或 Renderer。

## 当前范围

本阶段只建立唯一公开查询入口和 Provider Router 接入。`DataBuffer` 的主动加载职责，以及内存缓存、持久化缓存和淘汰策略将在后续阶段迁移到这组 API 的内部实现，不能再形成新的公开入口。
