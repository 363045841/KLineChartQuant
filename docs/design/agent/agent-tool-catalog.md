# Agent 工具目录：纯数据契约

## 背景

工具此前以 `@Tool` 装饰器逐方法注册到模块级全局表：导入模块即注册，工具与领域方法一一对应，安全等级是工具上的一个静态字段。结果是工具面等于领域 API 面（23 个图表工具里 8 个是 pane 操作），运行模式靠整只过滤工具，同一套过滤在宿主与 Provider 各写一遍。

## 决策

**工具契约是纯数据，由组合根一次组装；领域能力通过窄接口注入。**

### 分层

| 层 | 职责 |
| --- | --- |
| `features/agent/tools` | 声明 `name / label / description / parameters / effect` 与 `execute` |
| `features/agent/impl/chartToolDeps` | 把指标、图元、对比与行情能力适配成工具依赖 |
| `features/agent/impl/chartAgentController` | 只投影图表上下文，持有工具依赖 |
| 宿主（vue） | 按 `mode` 与用户勾选解析本轮工具，不再二次过滤 |

### 工具面

**按资源读写拆分**，因为安全等级是工具的属性，而不是某次调用的属性：

| 工具 | effect | 操作 |
| --- | --- | --- |
| `indicators_list` | read | 列出现有指标实例 |
| `indicators_write` | write | add / update / move / remove / clear |
| `drawings_list` | read | 列出已提交图元 |
| `drawings_write` | write | create / update / delete / copy / clear |
| `comparisons_list` | read | 列出对比品种 |
| `comparisons_write` | write | create / remove / clear |
| `instruments_query` | read | 精确代码查询 |
| `market_bars_query` | read | 最新一页 K 线 |
| `market_timeshare_query` | read | 分时，`days` 表达单日与多日 |
| `indicator_values_query` | read | 指标数值序列 |

共 10 只图表工具；加上 `web_search`、`ask_user` 与 `code_interpreter`，模型可见 13 只。

### 三条硬约束

1. **身份只出不进**：`add` 只接收定义、参数与落点，实例与容器身份由状态分配并返回。工具入参里没有 `instanceId`（写入新对象时）与 `paneId`。
2. **落点是语义不是容器**：图元用 `placement: "main" | <instanceId>` 寻址，`paneId` 不出现在任何工具契约里。
3. **模式只过滤一次**：`resolveTools({ mode, enabled })` 是唯一裁剪点；`plan` 只保留 `effect === 'read'`，`build` 全量。Provider 与注册表都不再过滤。
4. **提示词从清单推导**：能力说明看本轮是否提供了 `effect === 'write'` 的工具，而不是再看一次 `mode`。模式只剩“挑工具”一个消费点，提示词不会和清单漂移。

### 执行策略

`executionMode` 由 `effect` 推导：只读工具并行，写工具串行。它不再由工具静态声明，避免同一资源出现两种并发语义。

### 字段校验

扁平 schema 无法表达「按 action 必填」，因此 `requireFields` 在分发前显式校验并点名缺失字段（例如 `action=add requires definitionId`），让模型直接修正下一次调用。

## 后果

- 工具名、参数与描述集中在一处，新增工具不需要改宿主；改工具面不再牵扯领域类。
- `@Tool`、`registeredChartTools`、`ChartToolSafety`、`reversible` 与两处重复过滤全部删除。
- `ChartPaneFacade` 只保留布局；指标实例命令归 `ChartIndicatorFacade`，`PaneManager` 仍是唯一事务写入者。
- 工具描述是模型唯一可见的说明，读写拆分让每只工具能给出诚实的副作用声明。
