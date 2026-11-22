# Agent 查询模块

`packages/core/src/features/agent/` 为 Agent 提供图表、指标、图元、对比与行情的访问边界。工具是纯数据，
统一由 `createChartToolCatalog` 组装；行情结果转成紧凑文本，指标读取返回类型化投影，图元与对比返回投影字段，
不把领域对象原样交给模型。

指标计算与结果仓库的完整模型见
[`docs/design/agent/indicator-series-read.md`](../../../../../docs/design/agent/indicator-series-read.md)，
计算输入与展示配置的分层见
[`docs/design/indicator/indicator-parameter-layers.md`](../../../../../docs/design/indicator/indicator-parameter-layers.md)，
工具契约见 [`docs/design/agent/agent-tool-catalog.md`](../../../../../docs/design/agent/agent-tool-catalog.md)。

## 模块边界

```text
Agent tool
  -> ChartAgentIndicatorCommands.series
  -> ChartIndicatorFacade.readSeries
  -> ChartIndicatorManager（结果仓库 + 计算调度）
  -> 已提交 IndicatorResult
  -> projectIndicatorSeries
  -> columns / rows / objects / hlines
  -> Agent
```

本目录负责：

- 按 `indicator / row / order` 定位图上实例；`inputs` 按定义声明校验，未知键、类型与范围一次报全。
- 读取图上实例已提交的结果；带 `inputs` 时提交一次预览计算，与图表实例共用执行器和结果仓库。
- 把 `IndicatorSeries` 投影为列、行、绘图对象与水平线；一个 `limit` 约束全部输出，截断时报告省略数量。
- 无法识别为可读序列时返回专用错误与下一步，不降级为对象计数。

本目录不负责：

- 渲染指标、维护 pane 或读取 `renderStates`。
- 定义指标公式、默认输入或展示开关；这些属于 `engine/indicators/` 的指标定义。
- 把内部计算结果或领域对象原样返回给 Agent。

## 文件结构

```text
agent/
├── types.ts                               # 对外契约、数据类型与依赖接口
├── index.ts                               # 公共出口
├── tools/                                 # 工具契约（纯数据，按资源读写拆分）
│   ├── types.ts                           # ChartToolDefinition / ChartToolMetadata
│   ├── index.ts                           # 静态清单与组装入口
│   └── impl/
│       ├── catalog.ts                     # 组装十三只图表工具
│       ├── indicators.ts                  # indicators_list / indicators_write
│       ├── indicatorSeries.ts             # indicator_series_query
│       ├── drawings.ts                    # drawings_list / drawings_write
│       ├── comparisons.ts                 # comparisons_list / comparisons_write
│       ├── market.ts                      # 三只行情只读查询工具
│       └── helpers.ts                     # 必填字段校验与结果收敛
├── impl/
│   ├── chartAgentController.ts            # 图表上下文投影
│   ├── chartToolDeps.ts                   # 指标 / 图元 / 对比 / 行情命令面装配
│   ├── marketDataTextFormatter.ts         # 行情查询结果的紧凑文本转义
│   ├── markdownTable.ts                   # 共用 Markdown 表格渲染
│   └── indicator/
│       ├── parseIndicatorInputs.ts        # 按定义声明校验 Agent 输入
│       └── projectIndicatorSeries.ts      # series → 列 / 行 / 对象 / 水平线
├── __tests__/                             # agent 模块测试
└── README.md
```

## 工具契约

工具是声明在 `tools/` 里的纯数据：`name`、`label`、`description`、`parameters`、`effect` 与 `execute`。
按资源读写拆分（`indicators_list` / `indicators_write` 等），因为安全等级是工具的属性；运行模式在宿主
一侧只过滤一次：`build` 全量，`plan` 只保留 `effect === 'read'`。

三条硬约束：身份只出不进（指标按 `indicator / row / order` 寻址，入参不含实例 ID；`add` 返回名称与位置）；
落点是语义（窗格用显示行 `row` 寻址，指标 `placement` 只表达主图/副图，图元的身份是系统分配的 `id`）；
`executionMode` 由 `effect` 推导。完整决策见
[`docs/design/agent/agent-tool-catalog.md`](../../../../../docs/design/agent/agent-tool-catalog.md)。

## 读取规则

- 不带 `inputs`：读图上实例，使用实例当前输入与行情修订；不在图上时报错并列出可选的下一步。
- 带 `inputs`：按这组输入提交一次计算，缺省键取定义默认值；不添加实例、不改变图表。
- 计算结果按计算身份去重；相同输入与修订直接复用已发布结果。
- 时间窗与行情工具一致：日线及以上 `YYYY-MM-DD`，日内带偏移的 RFC 3339。
- 一个 `limit` 同时约束行与对象，默认 60，上限 2,000；截断时返回省略数量。

## 测试

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/features/agent
```
