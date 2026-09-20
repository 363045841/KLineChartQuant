# 测试替身收敛到共享夹具

渲染上下文、绘图适配器、Canvas / PluginHost、渲染后端、Chart DOM、ChartDataManager、depth、provider、领域业务数据（指标 K 线、Kernel、chartTypes、alerts、数值序列、AVWAP、MTF、order book、marker）与 Vue 侧的品种 / 聚合源 / Provider HTTP 替身不再是每个用例各写一份，而是统一由各域 `__tests__/helpers/`（Vue 在 `__tests__/`）下的夹具工厂产出。替身大小 = 接口大小，接口加字段时缺失会变成编译错误。

## 问题

同一替身在多个测试文件里被复制：

- `createMockRenderContext` 在 5 个 renderer 测试里各写一份，默认数据长度还分叉（ma 10 根、boll 100 根）。
- `createMockCanvasContext` 出现 7 份，`createMockPluginHost` 出现 4 份。
- 绘图 adapter 的 stub 在 `coordinateUtils` / `HitTester` / `interaction.selection` 里各手搓一份。
- 已有可复用工厂 `engine/drawing/__tests__/helpers/drawingTestKit.ts`，但自己用 `as unknown as DrawingChartAdapter` 绕过，成员缺失不报错。

后果：渲染上下文新增 `theme`、绘图适配器新增批量方法后，多份副本不同步，只在类型层面报错；7 个测试文件用 `@ts-nocheck` 把漂移整个屏蔽掉。

## 方案

两个夹具模块，按域划分：

| 模块 | 覆盖 |
| --- | --- |
| `engine/__tests__/helpers/renderTestKit.ts` | `createMockRenderContext` / `createMockPaneInfo` / `createMockPluginHost` / `createMockCanvasContext` / `createMockStateReader` / `createMockServiceHost` / `createMockIndicatorHost` |
| `engine/__tests__/helpers/chartDomTestKit.ts` | `createChartDom` / `createCanvasGetContextMock` / `createWebGLContextStub` / `ResizeObserverMock` / `installChartDomStubs` / `stubAnimationFrame` |
| `engine/drawing/__tests__/helpers/drawingTestKit.ts` | 图元构造 + `DrawingDocumentPort` / `DrawingViewportPort` / `DrawingSessionPort` 工厂 + `createDrawingAdapter` + `createFourBarTimelineAdapter` / flat-line / disjoint-channel / parallel-channel 图元工厂 |
| `engine/data/__tests__/helpers/chartDataManagerTestKit.ts` | `createMockViewport` / `createMockDataDependencies` / `createTestDocument` / `createChartDom` |
| `data/__tests__/helpers/depthTestKit.ts` | `createFakeEventSource` / `asEventSource` / `createEventSourceFactory` / `makeSnapshotEvent` / `makeDeltaEvent` / `createFakeDepthSource` / `createFakeHeatmapController` |
| `data/provider/__tests__/helpers/providerTestKit.ts` | `createMockMarketDataProvider` + `DEFAULT_SOURCE_CAPABILITIES` |
| `rendering/render/__tests__/helpers/rendererTestKit.ts` | `createMockSurfaceBackend` / `createMockSharedWebGLSurface` / `createMockRenderer` |
| `vue/src/composables/__tests__/testSymbols.ts` | `makeSearchableSymbol` / `TEST_SYMBOLS` |
| `vue/src/composables/__tests__/_aggregationSourceFixtures.ts` | `source` / `createOnlineProbe` / `createOfflineProbe` / `registerProvider` |
| `vue/src/features/agent/__tests__/_agentProviderFixtures.ts` | `providerModelCatalogResponse` / `stubProviderModelCatalog` / `createOpenAiCompatibleFetchStub` |
| `vue/src/features/agent/__tests__/_testChartAgent.ts` | `createTestChartAgent` / `createTestChartAgentContext` |
| `engine/indicators/__tests__/__fixtures__/synthetic.ts` | `fromCloses` / `createRisingTrend` |
| `engine/state/__tests__/helpers/createTestChartStateKernel.ts` | `createTestChartStateKernel` |
| `engine/state/__tests__/helpers/createViewportStateDeps.ts` | `createViewportStateDeps` |
| `features/chartTypes/__tests__/helpers/createOhlcvBar.ts` | `createOhlcvBar` |
| `features/alerts/__tests__/helpers/marketSnapshot.ts` | `createMarketSnapshot` |
| `features/indicators/__tests__/helpers/sequences.ts` | `ramp` / `constant` |
| `components/anchoredVwap/__tests__/helpers/createAvwapBar.ts` | `createAvwapBar` |
| `components/mtfOverlay/__tests__/helpers/createBaseBar.ts` | `createBaseBar` |
| `components/orderBookHeatmap/__tests__/helpers/createOrderBookDelta.ts` | `createOrderBookDelta` |
| `components/orderBookHeatmap/__tests__/helpers/createTestHeatmapController.ts` | `createTestHeatmapController` |
| `engine/marker/__tests__/helpers/createCustomMarker.ts` | `createCustomMarker` |

约束：

1. **项目自有类型用 `satisfies` 全量约束**：`RenderContext`、`PluginHost`、`PaneInfo`、三个绘图 port 的工厂都返回完整对象。接口加成员时，夹具不补就编译失败，这是替代 `@ts-nocheck` 的门禁。
2. **测试只声明差异**：入参是 `Partial<...>`（`pane` 允许只声明 `yAxis` 子集），其余走默认值。用例不再内联强转。
3. **DOM 类型是唯一例外**：`CanvasRenderingContext2D` 成员上百，无法完整实现，只在 `createMockCanvasContext` 内保留一处集中强转；其余 DOM stub（`HTMLElement`、`PointerEvent`、WebGL context）同理只允许在夹具内出现。
4. **可观测性内建**：`createMockCanvasContext` 记录 `strokeLineWidths` / `strokedPaths` / `dashedPaths`，并带最小 `canvas.width`；状态类替身（`PluginHost` 共享状态、绘图选择集合与工具状态）由内存变量承载，替换原先每个用例手写的 store。
5. **含私有字段的 class 视为 DOM 同类**：`SharedWebGLSurface`（私有 MSAA 字段）与 `ViewportStateModule`（成员过多）无法结构化满足，替身内部保留唯一一处集中强转，并对消费方暴露 class 类型 / 只读信号接口。
6. **spy 签名与被测接口一致**：`vi.fn` 的形参按生产签名声明，`mock.calls[i][j]` 保持类型；不写 `ReturnType<typeof vi.fn>`（vitest 5 下其含构造签名、不可调用）。

## 边界

- `satisfies` 只提供结构完整性，不提供运行时行为正确性；夹具默认值仍可能与被测实现预期不同，用例差异必须显式覆盖。
- 泛型 spy（`IndicatorRenderStateReader.get`、`PluginHost.getSharedState` / `getService`）在 vitest 类型系统下无法直接赋给泛型方法，夹具内用 `any` 返回 + `biome-ignore` 说明，保持可间谍性；这是唯一允许的 `any`。
- 夹具仅供 `__tests__` 消费，vitest 只收集 `*.test.ts`，不会被当作测试执行。
- 运行时代码零改动，仅测试基础设施与类型约束变化。
