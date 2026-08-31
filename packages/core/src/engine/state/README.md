# State 状态模块

`packages/core/src/engine/state/` 是图表业务状态的 composition root（组合根）。所有图表状态——标的、
周期、视口、缩放、数据、指标、绘图、交互、区间选择、主题等——都以此为单一可信源（SSOT），
由 `StateKernel` / `ChartStateKernel` 统一编排。

设计契约（`stateKernel.ts` 有完整说明）由 TypeScript 结构类型系统强制保证：

1. **SSOT**：每一段状态有且仅有一个 writable signal；不存在第二份缓存或手动同步路径。
2. **Computed 推导**：派生值放于 `computed()` 中，源 signal 变化后自动重求值，禁止 `syncXxx()`。
3. **读写分离**：外部消费者只能拿到 `ReadonlySignal`（无 `.set()`）；变更必须经 Action。
4. **批量原子更新**：多字段写入通过 `batch()` 合并为一次通知周期。

详细的 StateKernel 迁移背景见
[`docs/state-kernel-migration-plan.md`](../../../../docs/state-kernel-migration-plan.md)。

## 模块边界

```text
Chart（engine/chart.ts）
  -> new ChartStateKernel(deps)
  -> 各子状态 createXxxState()
  -> kernel.interaction / kernel.data / ...
  -> Controller（controllers/）通过 kernel 暴露 readonly signal + actions
  -> Framework adapter（Vue / React / Angular）消费 signals
```

本目录负责：

- 定义 `StateKernel` 抽象基类与 `SubStateModule` 组合契约。
- 为每一类图表状态提供 `createXxxState()` 子状态工厂：options、zoom、data、viewport、pane、
  systemTheme、settings、mode、drawing、interaction、dataManager、comparison、indicator、
  indicatorResult、marker、renderer、theme。
- 在 `ChartStateKernel` 中组合上述子状态，并暴露跨子状态的派生信号
  （如 `effectiveTheme$`、`dataLength$`、`indicatorResultAvailability$`）。
- 提供 `immutable.ts` 快照冻结工具，保证提交后对象图不可变。

本目录不负责：

- 图表绘制、渲染帧边界；由 `engine/render/` 与 `rendering/` 负责。
- 行情数据的实际拉取与缓冲；由 `engine/data/` 与 `data/` 负责。
- 业务查询 DTO 的构造；公开查询必须基于已提交结果构造受限投影。
- 维护任何状态的第二份副本；`StateKernel` 是唯一事实源。

## 目录结构

```text
state/
├── stateKernel.ts             # StateKernel 抽象基类 + SubStateModule 契约
├── chartStateKernel.ts        # Chart 具体 kernel：组合所有子状态与派生信号
├── optionsState.ts            # 图表选项（minKWidth、zoomLevelCount 等）
├── zoomState.ts               # 缩放级别与 kWidth 派生
├── dataState.ts               # 主图数据 buffer、周期、复权、可见数据版本
├── dataManagerState.ts        # 数据协调层：当前 spec、session slots 等
├── viewportState.ts           # 视口几何、DPR clamp 与尺寸
├── paneState.ts               # 主图/副图布局
├── modeState.ts               # kline / timeshare / fiveDayTimeShare / comparison 模式
├── systemTheme / themeState.ts # 主题偏好与生效主题推导
├── settingsState.ts           # 用户偏好设置快照
├── drawingState.ts            # 绘图工具、图元与选中 id
├── interactionState.ts        # 十字线、悬停、拖拽、区间选择
├── indicatorState.ts          # 指标实例与副图配置
├── indicatorResultState.ts    # 指标计算结果池与版本
├── markerState.ts             # 自定义 marker 业务状态
├── comparisonState.ts         # 对比序列状态
├── rendererState.ts           # renderer backend 运行时状态
├── immutable.ts               # 快照深度冻结工具
└── __tests__/                 # 各子状态与派生信号测试
```

## 读写模型

每个子状态工厂通过 `createSubState()` 构建 `{ signals, readonly, snapshot }`：

- `signals`：`WritableSignal` 集合，仅子状态 Action 内部可写。
- `readonly`：对外暴露的 `ReadonlySignal` 集合，类型系统禁止从外部 `.set()`。
- `snapshot()`：一次读取全部源信号的可序列化快照。

子状态返回 `{ readonly, actions, dispose }`；`ChartStateKernel` 将它们编排进统一的
`signals` 与 `actions` bag。业务代码只能通过 `kernel.xxx.readonly.yyy()` 读取、
通过 `kernel.xxx.actions.yyy()` 写入。

## 派生信号

`ChartStateKernel` 在构造时组合多个只读派生信号，消费方不关心依赖链：

| 信号                           | 含义                                              |
| ------------------------------ | ------------------------------------------------- |
| `zoomLevel$`                   | 当前缩放级别                                        |
| `dataLength$`                  | 当前主图数据条数                                    |
| `effectiveTheme$`              | 由偏好主题 + 系统主题推导的生效主题                  |
| `activeRenderers$`             | 当前状态要求启用的受管 renderer layer                |
| `optionsForViewport$`          | 视口几何依赖的选项投影                               |
| `sessionSlots$`                | 由品种 market 派生的分时交易时段槽位数                |
| `indicatorResultAvailability$` | 指标结果相对数据/配置快照的可用性                    |

## 新增一个子状态

1. 新建 `createXxxState.ts`，用 `createSubState()` 定义字段、Action 与 dispose。
2. 在 `index.ts` 导出工厂与模块类型。
3. 在 `ChartStateKernel` 中声明字段、构造并编排，必要时补充派生信号。
4. 在 `__tests__/` 覆盖 Action 的原子性、只读边界与派生信号重算。

## 测试

核心测试位于本目录 `__tests__/`，覆盖主题推导、对比状态、指标结果可用性、
指标实例副图、视图快照等派生关系。运行 Core 全量测试：

```bash
pnpm --filter @363045841yyt/klinechart-core test
```