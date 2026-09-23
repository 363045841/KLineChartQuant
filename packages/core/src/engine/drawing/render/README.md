# render — 投影、图形定义与绘制

`engine/drawing/render/` 承载绘图子系统的渲染侧：kernel 状态投影、图形定义注册与计算、
绘制原语落到 canvas、以及渲染插件。对外契约在 `types.ts`，实现在 `impl/`。

## 模块边界

本目录负责：

- `DrawingStore`：把 kernel 业务 SSOT 与会话 overlay 合并为渲染读取视图。
- `DrawingDefinitionRegistry`：按图元种类查找定义并计算几何。
- 绘制原语渲染器：把 `DrawingPrimitive` 画到 canvas。
- 内置图形定义工厂与注册入口。
- 渲染插件：把帧投影产出的绘制原语绘制到 Pane。

本目录不负责：

- 图元模型与持久化：属 `model/`。
- 坐标换算与帧投影：属 `geometry/`。
- 指针交互：属 `interaction/`。

## 目录结构

```text
render/
├── types.ts                          # PrimitiveRendererSet、DrawingStoreDeps
└── impl/
    ├── DrawingStore.ts               # 渲染读取视图（SSOT ⊕ overlay）
    ├── DrawingDefinitionRegistry.ts  # 图形定义注册表
    ├── primitiveRendererSet.ts       # createDefaultPrimitiveRendererSet（canvas 绘制）
    ├── plugin.ts                     # 渲染插件：绘制帧原语到 Pane
    └── definitions/                  # 内置图形定义工厂 + 注册入口
        ├── twoPointLine.ts
        ├── fibRetracement.ts
        ├── rectangle.ts
        ├── arrow.ts
        ├── singleAnchorLine.ts
        ├── infoLine.ts
        ├── channels.ts
        └── index.ts                  # registerDefaultDrawingDefinitions
```

## 依赖

- `foundation/plugin/`：`RenderContext`、`RendererPlugin` 与渲染 primitive。
- `foundation/tokens`：默认描边与锚点填充色。
- `engine/drawing/types.ts`：图元领域模型契约。
- `session/impl/DrawingState.ts`：`DrawingStore` 合并 overlay 时的 `mergePaint` / `PREVIEW_ID`。
- `geometry/impl/`：`labelLayout`、`lineClipping`、`fillRegions`、`coordinateUtils`、`linearRegression`。

## 约定

- 绘制侧只消费 `DrawingPrimitive`，不感知具体图形语义；图元几何由 `DrawingDefinition.compute` 纯函数产出。
- 颜色统一取 `foundation/tokens`，禁止局部硬编码。
