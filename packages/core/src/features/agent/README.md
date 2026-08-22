# Agent 指标查询模块

`packages/core/src/features/agent/` 为 Agent 提供指标信息访问边界。它保留现有的
`definitionId + params + from/to/limit` 查询入参，复用既有计算 Runtime；计算完成后直接转义为紧凑
文本而非 JSON，以减少 Agent 的 token 输入。它不读取或写入图表的渲染结果池。

指标计算和结果池的完整模型见
[`docs/design/indicator-result-kernel-implementation.md`](../../../../../docs/design/indicator-result-kernel-implementation.md)，
计算参数与展示配置的分层见
[`docs/design/indicator-runtime-parameter-separation.md`](../../../../../docs/design/indicator-runtime-parameter-separation.md)。

## 模块边界

```text
Agent tool
  -> indicator/indicatorQuery
  -> 注册的 IndicatorMetadata.runtime.compute
  -> indicator/indicatorTextFormatter
  -> 紧凑文本
  -> Agent
```

本目录负责：

- 保留并校验 Agent 既有的指标标识、数值计算参数、时间范围和返回数量。
- 复用已注册指标的 `runtime.compute`，不维护第二套 calculator。
- 在行情快照版本稳定时转义原始 `series: unknown`，不定义指标专用结果 DTO。
- 按 `definitionId` 匹配专用转义器；未匹配时降级为 Markdown 表格。
- 只向 Agent 返回紧凑文本。

本目录不负责：

- 渲染指标、维护 pane 或读取 `renderStates`。
- 定义指标公式、默认计算参数或展示开关；这些属于 `engine/indicators/` 的指标定义。
- 将内部计算结果或 JSON DTO 原样返回给 Agent。

## 文件结构

```text
agent/
├── indicatorQuery.ts                 # 保留既有入参的查询编排与纯计算调用
├── indicatorTextFormatter.ts         # 专用转义器注册与 Markdown 降级选择
├── indicatorSemanticFormatters.ts    # Structure、Zones、Volume Profile 专用文本
├── indicatorMarkdownFormatter.ts     # 未注册结果的通用 Markdown 表格
└── __tests__/
    ├── indicatorQuery.test.ts        # 查询与文本出口测试
    └── indicatorTextFormatter.test.ts # 专用和降级转义测试
```

## 查询规则

调用方可覆盖已注册的数值计算参数；未知参数、非数值参数和展示选项都会被拒绝。计算始终使用完整活动
行情，以保留 MA、RSI 等指标的历史窗口，`from`、`to` 与 `limit` 由转义器限制最终文本中的条目数。
每次查询最多返回 2,000 项，默认返回最近 20 项。

## 文本转义

`series` 是 Runtime 返回的 `unknown` 原始结果。`indicatorTextFormatter.ts` 根据 `definitionId` 选择转义器：

- `structure`：趋势与近期 BOS/CHOCH 事件。
- `zones`：价格区间、状态和发生时间。
- `volumeProfile`：POC、价值区、总量和高量区。
- 其余结果：转为 Markdown 表格；字段名只在表头出现一次，嵌套对象展开为点号字段，数组只显示长度。

例如：

```text
Structure | 1h
偏多；最新 BOS 向上 72,180
需求区 70,900-71,240
失效：收盘低于 70,900
```

没有专用转义器的新指标仍可被查询，不会因结果形状未知而拒绝。之后只需注册对应
`definitionId` 的转义函数，即可在不变更计算管线和查询契约的前提下提升信息密度。

## 测试

```bash
pnpm --filter @363045841yyt/klinechart-core exec vitest run src/features/agent
```
