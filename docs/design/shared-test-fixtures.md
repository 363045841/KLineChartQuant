# 测试替身收敛到共享夹具

渲染上下文、绘图适配器、Canvas / PluginHost 替身不再是每个用例各写一份，而是统一由 `packages/core/src/engine/__tests__/helpers/` 下的夹具工厂产出。替身大小 = 接口大小，接口加字段时缺失会变成编译错误。

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
| `engine/drawing/__tests__/helpers/drawingTestKit.ts` | 图元构造 + `DrawingDocumentPort` / `DrawingViewportPort` / `DrawingSessionPort` 工厂 + `createDrawingAdapter` |

约束：

1. **项目自有类型用 `satisfies` 全量约束**：`RenderContext`、`PluginHost`、`PaneInfo`、三个绘图 port 的工厂都返回完整对象。接口加成员时，夹具不补就编译失败，这是替代 `@ts-nocheck` 的门禁。
2. **测试只声明差异**：入参是 `Partial<...>`（`pane` 允许只声明 `yAxis` 子集），其余走默认值。用例不再内联强转。
3. **DOM 类型是唯一例外**：`CanvasRenderingContext2D` 成员上百，无法完整实现，只在 `createMockCanvasContext` 内保留一处集中强转；其余 DOM stub（`HTMLElement`、`PointerEvent`、WebGL context）同理只允许在夹具内出现。
4. **可观测性内建**：`createMockCanvasContext` 记录 `strokeLineWidths` / `strokedPaths` / `dashedPaths`，并带最小 `canvas.width`；状态类替身（`PluginHost` 共享状态、绘图选择集合与工具状态）由内存变量承载，替换原先每个用例手写的 store。

## 边界

- `satisfies` 只提供结构完整性，不提供运行时行为正确性；夹具默认值仍可能与被测实现预期不同，用例差异必须显式覆盖。
- 泛型 spy（`IndicatorRenderStateReader.get`、`PluginHost.getSharedState` / `getService`）在 vitest 类型系统下无法直接赋给泛型方法，夹具内用 `any` 返回 + `biome-ignore` 说明，保持可间谍性；这是唯一允许的 `any`。
- 夹具仅供 `__tests__` 消费，vitest 只收集 `*.test.ts`，不会被当作测试执行。
- 运行时代码零改动，仅测试基础设施与类型约束变化。
