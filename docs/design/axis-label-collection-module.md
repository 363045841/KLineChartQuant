# 轴标签单帧收集模块化

## 背景

轴标签（X 轴时间标签、Y 轴价格标签）的“当前帧收集”此前散落在 `engine/render/chartRenderer.ts`
的 `renderPanes` 内：直接 `const sharedXAxisLabels: XAxisLabel[] = []` 声明可变数组，
各 Pane 的 `RenderContext` 再以裸数组挂载 `yAxisLabels`/`xAxisLabels`，
绘图投影结果由 `renderPanes` 手工 `push` 合并。收集语义（X 轴共享、Y 轴 Pane 隔离）
只存在于注释与调用点的约定里，缺少独立契约。

## 决策

- 新增 `engine/axisLabels/` 模块，采用 `types.ts + impl/` 分层（对齐仓库既有语义化模块布局）：
  - `types.ts` 定义 `YAxisLabelCollector`、`XAxisLabelCollector`、`AxisLabelsFrame`、
    `AxisLabelRegistrars` 的对外形状，不依赖 `impl/`；
  - `impl/axisLabelCollector.ts` 提供 `createYAxisLabelCollector`、
    `createXAxisLabelCollector`、`createAxisLabelsFrame` 实现。
- **单帧聚合是 SSOT**：`createAxisLabelsFrame()` 每帧新建，聚合“共享 X 轴收集器 +
  按 paneId 惰性持有的 Y 轴收集器”。两个语义在类型层面固定下来，不再依赖调用点约定。
- **收集器暴露可变缓冲区**：`collector.labels` 即 `RenderContext.yAxisLabels` /
  `xAxisLabels` 指向的数组。轴渲染器继续消费数组；生产者通过注册入口写入。
- **注册入口与数组双轨兼容**：`RenderAxisContext` 新增可选 `yAxisLabelRegistrar` 字段，
  类型为 foundation 内声明的结构化 `AxisLabelRegistrar<T>`（foundation 不反向依赖 engine，
  避免循环依赖）。帧构建时由轴标签模块注入收集器；轴标签生产者经
  `registerYAxisLabel(context, label)`（模块公开入口导出）注册，未注入注册器的手工上下文
  （如单测）回退为直接写入 `yAxisLabels`。回退逻辑只有这一处，不做无意义分支。
- `renderPanes` 将本 Pane 的 Y 轴和共享 X 轴收集器传给绘图帧投影，图元在计算锚点时
  直接调用 `register`。独立调用投影函数且未传入收集器时，仍在返回的投影结果中提供
  轴标签，兼容现有的纯计算调用方。
- **公开入口收口**：新增 `engine/axisLabels/index.ts` 作为模块唯一 barrel，只做重导出；
  `chartRenderer`、`lastPrice` 等模块外调用方从该入口依赖，不再指向 `impl/` 内部路径。

## 边界

- 不改变 Pane 隔离 Y / 共享 X 的既有行为；绘图帧投影的标签生成规则、
  时间轴/Y 轴实际绘制与十字线的逻辑不变。
- 不引入跨帧状态：聚合对象每帧重建，帧结束随对象释放。
- 不涉及绘图内部文字标签（`DrawingLabel` 等），仅覆盖轴标签收集。
- 不改变 `RenderAxisContext.yAxisLabels` 等数组字段的类型，避免波及所有轴渲染器；
  `yAxisLabelRegistrar` 为可选，既有手工上下文无需改动即可编译。

## 影响与验证

- 轴标签写入路径集中到单帧收集器，渲染语义不变。
- 单测：`engine/axisLabels/__tests__/axisLabelCollector.test.ts` 覆盖 Pane 隔离、
  同 paneId 稳定返回、共享 X 轴、批量注册、缓冲区可见性与 `registerYAxisLabel` 的
  注册器/回退两条路径；`engine/renderers/__tests__/lastPrice.registrar.test.ts` 覆盖
  最新价经注入收集器注册及越界不注册；`frameProjection.test.ts` 覆盖图元直接注册。
- 验证：`pnpm type-check`；聚焦运行 `frameProjection`、`axisLabelCollector`、
  `lastPrice.registrar` 共 26 个用例通过。此前版本曾通过 `pnpm test:packages`，
  图元直接注册的后续改动仅运行了上述聚焦测试。
