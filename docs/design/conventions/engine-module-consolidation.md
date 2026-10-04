# engine 一级模块合并：归位 layout / labels / facade / utils

## 背景

`packages/core/src/engine/` 下堆积了 17 个一级目录，其中 `layout`、`labels`、`facade`、`utils`
体量小（合计约 2000 行）且与相邻模块职责重叠，属于“单一级别目录过多”。按仓库
「Semantic module layout」约定（`<module>/types.ts` + `<module>/impl/` + `<module>/index.ts`），
本次只做目录与契约归位，不改任何运行时行为、函数签名或公开导出名。

## 决策

### 1. `layout/` → `pane/impl/layout/`

`chartPaneLayout`、`Pane`、`paneRatioMath` 全部是 pane 的布局与几何，归入 pane 领域。
`layout → pane` 单向依赖，`pane` 不依赖 `layout`，不新增环。

- 对外契约收口到已存在的 `engine/pane/index.ts` barrel：新增重导出 `ChartPaneLayout`、`Pane`、
  `UpdateLevel`；模块外调用方一律从 `pane/index.js` 依赖，不再指向 `pane/impl/layout/...`。
- `Pane` 声明所在的实现文件改为通过 `../paneRenderer.js`（impl 兄弟文件）引用渲染器，
  避免 `pane/index.ts` ↔ `pane/impl/layout/chartPaneLayout.ts` 的 barrel 环。
- `engine/pane/impl/paneRenderer.ts` 的内联 `import('../../layout/pane.js').Pane` 改为
  `import('./layout/pane.js').Pane`。

### 2. `labels/` → `renderers/impl/labels/`

轴标签收集/绘制属于渲染职责，且 `labels` 不依赖任何 engine 内部模块；消费方
（`frame/chartRenderer`、`renderers/lastPrice`、`timeAxis`、`yAxis`、`indicator_scale`、
`drawing/geometry/frameProjection`）本就属于渲染链路。`renderers` 无模块级 barrel，
故标签模块保留自身 `index.ts` 作为契约，外部按 `renderers/impl/labels/index.js` 依赖。

### 3. `facade/` → `chart/impl/facade/`

6 个 `chartXxxFacade` 只被 `engine/chart/impl/chart.ts` 引用，是 Chart 对 controllers/Agent
暴露的公共 API 适配层，本属装配层内部实现。归入 `chart/impl/facade/` 后 `chart.ts` 以
`./facade/...` 直接引用，不再暴露为 engine 一级模块。

### 4. `utils/` 拆解归位

`utils` 是典型杂物间，无 `types.ts`/`impl/` 契约，违背语义化模块约定。按职责拆分：

| 原文件 | 新位置 | 依据 |
|--------|--------|------|
| `axisTicks.ts` / `tickPosition.ts` / `tickCount.ts` | `scale/impl/axisTicks/` | Y 轴刻度生成，属坐标标度 |
| `zoom.ts` / `chartZoomController.ts` | `viewport/zoom.ts` / `viewport/chartZoomController.ts` | 缩放级别与缩放手势 |
| `visibleBarIndex.ts` / `visiblePriceExtrema.ts` | `viewport/` | 可见区间几何 |
| `klineConfig.ts` | `viewport/klineConfig.ts` | K 线物理槽位几何 |

- `scale/index.ts` barrel 新增重导出 `createYAxisTicks`、`calculateValueTickPositions`。
- `viewport` 沿用现有平铺风格（无模块级 barrel），外部按 `viewport/<file>.js` 依赖。
- `utils` 目录整体消失。

### VisibleRange 类型归位

原 `layout/pane.ts` 的 `VisibleRange` 是本就在 viewport 语义内的共享类型，且
`visiblePriceExtrema` 移入 viewport 后会与 pane 形成依赖环。故将 `VisibleRange` 定义迁入
`engine/viewport/viewport.ts`（`pane` 已依赖 `viewport`，方向单向，无环），
`UpdateLevel` 留在 `pane/impl/layout/pane.ts` 并由 pane barrel 导出。

## 已发布包级子路径

`@363045841yyt/klinechart-core/engine/utils/zoom` 与 `.../engine/utils/klineConfig` 是已发布
子路径。按 `module-layout-convention.md` 既定处理方式：**exports 的 key 保持不变**（外部导入
路径不变，不构成破坏性变更），target 指向新位置：

- `./engine/utils/zoom` → `./dist/engine/viewport/zoom.js`
- `./engine/utils/klineConfig` → `./dist/engine/viewport/klineConfig.js`

## 边界与验证

- 纯结构搬移与契约归位，无行为、签名、公开导出名变更。
- 导入风格：模块内实现互相依赖 `impl/` 兄弟文件；模块外调用方依赖 `index.ts` barrel /
  `types.ts`；无 barrel 的 viewport 保持 `viewport/<file>.js`。
- 门禁：`pnpm lint`、`pnpm type-check`、`pnpm test:packages`（core），并对渲染/交互做人工回归。
