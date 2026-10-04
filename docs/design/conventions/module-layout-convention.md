# 语义化模块布局：types.ts + impl/

## 通用约定

仓库约定（AGENTS.md「Semantic module layout」）：有独立职责的功能模块采用 `<module>/types.ts`（对外契约、数据类型、依赖接口）+ `<module>/impl/`（实现）的布局，`<module>/__tests__/` 只用于测试该模块。`types.ts` 不依赖同模块 `impl/`；调用方优先依赖契约，实现只能从 `impl/` 导入。`index.ts` 只做重导出，作为模块唯一公开 barrel。

本文件记录该约定在 `data/` 与 `engine/drawing/` 两个大模块上的落地。

## data 层

`packages/core/src/data/` 此前整层是扁平风格：实现文件直接堆在子模块根目录，且部分对外契约（`MarketDataSourceConfig` / `SourceCapabilityQuery` / `SourceRouter*Request` / `RoutedMarketData`）住在实现文件 `registry.ts` / `router.ts` 里。现只做目录与契约归位，不改任何运行时行为：

```
data/
├── index.ts
├── buffer/
│   ├── types.ts                # 原 dataBufferTypes.ts
│   └── impl/                   # marketDataCache / dataBuffer / timeShareBuffer / seriesRepository / ...
├── depth/
│   ├── types.ts                # 原 depthTypes.ts
│   └── impl/                   # binance / depthConnector
├── live/
│   ├── types.ts
│   └── impl/barsLive.ts
└── provider/
    ├── types.ts                # 领域模型 + 注册表 / Router 契约
    ├── index.ts
    ├── impl/                   # registry / router / instrumentSearch / sourceRegistry
    │   └── sources/            # 各数据源装配与注册
    └── protocol/
        ├── types.ts            # wire 契约
        ├── index.ts
        └── impl/               # httpTransport / provider
```

- **契约归位**：`registry.ts` 的 `MarketDataSourceConfig` / `MarketDataSourceConfigPatch` / `SourceCapabilityQuery`，以及 `router.ts` 的 `SourceRouterInstrumentIdentity` / `SourceRouter*Request` / `SourceRouteAttempt` / `RoutedMarketData` 全部移入 `provider/types.ts`；`registry.ts` / `router.ts` 作为实现对契约只读依赖，`types.ts` 不依赖 `impl/`。
- **`*Types.ts` 更名 `types.ts`**：`buffer/dataBufferTypes.ts` → `buffer/types.ts`，`depth/depthTypes.ts` → `depth/types.ts`。
- **protocol 作为子模块**：`protocol/types.ts` 是 wire 契约，`httpTransport.ts` / `provider.ts` 是 wire 实现，后者进入 `protocol/impl/`。

### 公开子路径

`@363045841yyt/klinechart-core/market-data/sources` 与 `.../sources/*` 是已发布的包级子路径。`sources/` 是纯实现，按约定进入 `impl/sources/`。处理方式：

- **exports 的 key 保持不变**（外部消费者的导入路径不变，不构成破坏性变更）；
- **target 指向新位置** `./dist/data/provider/impl/sources/*`。

`./market-data` 子路径指向 `data/provider/index.ts`（未移动），保持不变。`sources/` 位于 `impl/` 之下属实现，其稳定契约是包级子路径 key，而非源码目录名。

### 边界

只移动位置与契约归属，不改任何函数签名、行为或运行时语义；`index.ts` 的公共导出集合保持不变（并补齐此前遗漏的 `SourceRouterTimeShareRangeRequest`）。

### 附：错误码收敛

`errors.ts` 已有 `ERROR_CODES`（fetch 族），但流转层与大量模块仍在用字符串字面量。本次一并收敛：

- `ERROR_CODES` 由类型注解改为 `as const satisfies`，保留字面量类型——原注解会把值拓宽为 `KLineChartErrorCode`，导致 `error.code === ERROR_CODES.X` 无法参与类型收窄。
- 新增 `GENERIC_ERROR_CODES`（`INVALID_PARAM` / `INVALID_STATE` / `DISPOSED` / `NOT_REGISTERED`），供入参与生命周期类错误统一引用；`SUBPANE_ERROR_CODES` 的两个值改为引用它。
- fetch 族（`FETCH_FAILED` / `FETCH_ABORTED` / `UNSUPPORTED_CAPABILITY` / `INSTRUMENT_NOT_FOUND`）在 `provider/impl/router.ts`、`provider/protocol/impl/provider.ts`、`provider/impl/instrumentSearch.ts`、`live/impl/barsLive.ts` 改为 `ERROR_CODES.*`。
- 通用码在 17 个生产文件（scale / input / rendering / engine / foundation / data 等）改为 `GENERIC_ERROR_CODES.*`；测试断言保留字面量。
- 领域族具名常量（`SCALE_ERROR_CODES` / `FOOTPRINT_ERROR_CODES` / `AVWAP_ERROR_CODES` / `INDICATOR_ERROR_CODES` / `HEATMAP_ERROR_CODES` / `MTF_ERROR_CODES` / `CHART_TYPE_ERROR_CODES` / `REPLAY_ERROR_CODES` / `DEPTH_ERROR_CODES`）已补齐，对应调用点全部改为引用常量。

未纳入：`MarketDataErrorCode`（`errorCode()` 的返回值）是 data 层独立领域词汇，不是 `KLineChartError` 码；`protocol/types.ts` 的 `SOURCE_REJECTION_CODES` 是「可流转错误码集合」的定义本身；`errors-help.ts` 的 `HINTS` 是「码 → 恢复提示」定义表；测试断言保留字面量。

### 附：data 层硬编码字符串收敛

| 位置 | 原字面量 | 改为 |
|------|----------|------|
| `buffer/impl/marketDataCache.ts`、`provider/impl/router.ts` | `'auto'` | `AUTO_SOURCE_ID`（上提到 `provider/types.ts`，避免 provider → buffer 反向依赖） |
| `buffer/impl/marketDataCache.ts` | `'latest'` | `LATEST_TRADING_DATE` |
| `buffer/impl/marketDataCache.ts` | `'exhausted'` | `OLDER_DATA_STATUS.EXHAUSTED` |
| `provider/protocol/impl/httpTransport.ts`、`live/impl/barsLive.ts` | `/api/v1/market-data/...` 端点路径 | `V1_ENDPOINTS.*` |
| `provider/protocol/impl/httpTransport.ts` | `{ 'Content-Type': 'application/json' }` | `JSON_HEADERS` |
| `provider/protocol/impl/provider.ts` | `'CN'` | `CN_SESSION_ID` |

刻意保留：类型化联合的判别值（`'bars'` / `'snapshot'` / `'exhausted'` 之类的内部判别）、wire 协议字段名、数据源注册表数据、mock 夹具、`errors-help` 的码 → 提示表。

## 绘图模块

`packages/core/src/engine/drawing/` 迁移完成后，24 个源文件（约 4200 行）全部平铺在模块根目录，没有分层；`index.ts` 膨胀到 915 行，同时承担类型重导出、`DrawingStore` 投影器、`DrawingDefinitionRegistry`、canvas 绘制原语渲染器、10 个图形定义工厂以及磁吸/工具表重导出等 5 类职责。图元领域模型（`DrawingObject`、`DrawingKind`、`PersistedDrawingAnchor`、`DrawingDefinition` 等）还错误地定义在 `foundation/plugin/types.ts`。

### 1. 渲染 primitive 与领域模型分层

- **保留在 `foundation/plugin/types.ts`**：`DrawingStyle`、`ScreenPoint`、`DrawingLabelPosition`、`PrimitiveTextAttachment`、`ScreenDrawingAnchor`、`DrawingPrimitive` 及全部 `*Primitive`、`DrawingFrameProjection`。原因：`RenderContext` / `RenderOverlayContext`（foundation 的渲染契约）依赖这些屏幕原语，foundation 不能反向依赖 engine。
- **迁入 `engine/drawing/types.ts`**：`DrawingObject`、`ResolvedDrawingObject`、`DrawingKind`、`PersistedDrawingAnchor`、`ResolvedDrawingAnchor`、`DrawingAnchorType`、`DrawingLabel(s)`、`DrawingLabelIndex`、`DrawingWorkspaceId`、`DrawingGeometry`、`DrawingComputeContext`、`DrawingDefinition`。原因：这些是绘图领域模型，与插件系统无关，属于本模块对外契约。

### 2. 子模块语义划分

模块内按职责切成 6 个子模块，每个子模块采用 `<sub>/types.ts + <sub>/impl/` 分层（对齐 `engine/marker/shape` 既有先例）；契约类型从 impl 抽出到各层 `types.ts`，`types.ts` 不依赖同模块 impl。

| 子模块 | 职责 |
|--------|------|
| `model` | 持久化领域模型：文档 CRUD、命令层、锚点物化、标签归一化 |
| `session` | 会话 overlay 与选择集合（预览/拖拽覆盖，不进 kernel） |
| `geometry` | 坐标换算、帧投影、线表、填充、标签布局、回归、视口裁剪 |
| `interaction` | 落点收集、预览、拖拽、命中选择、工具表（磁吸档位分发） |
| `magnet` | OHLC 磁吸档位契约与吸附纯函数 |
| `render` | `DrawingStore` 投影器、`DrawingDefinitionRegistry`、绘制原语渲染器、图形定义工厂、渲染插件 |

磁吸吸附（`MagnetMode` / `MagnetSnapConfig` / `snapPointerToOhlc`）独立为 `magnet` 子模块：`geometry` 的落点解析与 `interaction` 的档位分发都依赖它，若留在 `interaction/impl` 会让 `geometry/impl/coordinateUtils.ts` 反向依赖 `interaction` 的磁吸实现。独立后磁吸相关依赖为 `geometry → magnet`、`interaction → magnet`；`geometry/impl/frameProjection.ts` 仍因框选投影依赖 `interaction/impl/selectionMarquee.ts`，不在磁吸模块抽离范围内。

### 3. 工具 ID 与磁吸档位常量收口

绘图工具 ID 与磁吸档位的字面量集中为两张常量表：`interaction/types.ts` 的 `DrawingTool`（工具 id）与 `magnet/types.ts` 的 `MagnetMode`（off/weak/strong），`DrawingToolId` / `MagnetMode` / `ActiveMagnetMode` 三个类型都由常量派生。新增工具或档位只改常量表，运行时比较点（`toolConfig`、`interaction`、`PreviewRenderer`、`magnetSnapper`、`drawingState` 与 Vue 工具栏）一律引用常量，避免重命名后各调用点静默失配。

- 常量不带 `: DrawingToolId` 标注，保留字面量类型，`switch` 才能正常收窄；需要完整联合类型的信号（`drawingState.drawingTool`、Vue 的 `drawingToolId`）显式标注。`CURSOR_DRAWING_TOOL_ID` / `BOX_SELECT_DRAWING_TOOL_ID` 保留为 `DrawingTool.Cursor` / `DrawingTool.BoxSelect` 的别名，engine、controllers、features/agent 与 Vue 的运行时比较一律引用常量，禁止散落字面量；仅测试断言与纯类型声明可保留字面量。
- `DrawingKind`（`engine/drawing/types.ts`）是与 `DrawingToolId` 不同的词汇表（如 `h-line` → `horizontal-line`），其字符串字面量不受本约束影响，两者通过 `getDrawingKind` 单点映射。
- Vue 侧 `range-select` 是纯 UI 模式 id（不写进 kernel `DrawingToolId`），统一由 `packages/vue/src/components/toolbarToolIds.ts` 的 `RANGE_SELECT_UI_TOOL_ID` 提供。

### 4. 公开入口收口

`engine/drawing/index.ts` 收敛为唯一公开 barrel：只做重导出，不再承载实现。所有模块外调用点（controllers、features/agent、engine/facade、engine/state、engine/frame、vue 适配层）统一从该 barrel 或 `engine/drawing/types.ts` 依赖，禁止再指向模块内部实现文件，使后续内部搬移不影响外部。

适配层（Vue）的绘图类型改从 `@363045841yyt/klinechart-core/controllers` 门面获取，不再从 `.../plugin` 子路径取（后者只保留 foundation 渲染原语）。

### 影响与验证

纯结构搬移 + 契约换位，无行为变更；`DrawingDocument` / `DrawingCommands` / `DrawingStore` / `DrawingDefinitionRegistry` 等所有公开导出名保持不变。常量收口后新增/重命名工具 ID 只需改动 `DrawingTool` 常量表，编译器强制暴露所有消费点。门禁：`pnpm type-check`、`pnpm test:packages`（core）、`pnpm lint`，并对绘图交互做人工回归。
