# Agent 工具目录：纯数据契约

## 背景

工具此前以 `@Tool` 装饰器逐方法注册到模块级全局表：导入模块即注册，工具与领域方法一一对应，安全等级是工具上的一个静态字段。结果是工具面等于领域 API 面（23 个图表工具里 8 个是 pane 操作）。运行模式一度靠整只过滤工具，工具表随 plan/build 变化，既让模型看不到写能力，也把每轮请求的前缀缓存打穿。

## 决策

**工具契约是纯数据，由组合根一次组装；领域能力通过窄接口注入。**

### 分层

| 层 | 职责 |
| --- | --- |
| `features/agent/tools` | 声明 `name / label / description / parameters / effect` 与 `execute` |
| `features/agent/impl/chartToolDeps` | 把指标、图元、对比与行情能力适配成工具依赖 |
| `features/agent/impl/chartAgentController` | 只投影图表上下文，持有工具依赖 |
| 宿主（vue） | 按用户勾选解析工具；模式不参与裁剪，只决定执行期 gate |

### 工具面

**按资源读写拆分**，因为安全等级是工具的属性，而不是某次调用的属性：

| 工具 | effect | 操作 |
| --- | --- | --- |
| `indicators_list` | read | 列出现有指标实例 |
| `indicators_write` | write | add / update / move / remove |
| `drawings_list` | read | 列出当前标的的图元 |
| `drawings_write` | write | create / update / delete |
| `comparisons_list` | read | 列出对比品种的投影字段 |
| `comparisons_write` | write | create / update（显隐）/ remove |
| `instruments_query` | read | 代码或名称查询品种，返回固定列 |
| `market_bars_query` | read | K 线，`from`/`to` 日期窗口 + `limit` |
| `market_timeshare_query` | read | 分时，`days` 表达单日与多日，缺省最近交易日 |
| `indicator_series_query` | read | 指标数值、绘图对象与水平线 |
| `script_reference_query` | read | 按主题读取指标脚本参考 |
| `scripts_read` | read | 列出用户指标脚本或按 id 读取源码 |
| `scripts_write` | write | create / update / delete 用户指标脚本 |

共 13 只图表工具；浏览器宿主再加 `web_search` 与 `ask_user`，模型可见 15 只。`code_interpreter` 已在 agent-runtime 实现，由宿主按需装配。

### 硬约束

1. **身份只出不进**：`add` 只接收指标名称、参数与落点，实例与容器身份由状态分配；内部实例 ID 与 `paneId` 都不出现在工具入参里。
2. **落点是语义不是容器**：窗格身份就是显示行 `row`，`paneId` 与指标实例 ID 都不出现在任何工具契约里。
3. **工具表不随模式变化**：`resolveTools` 只应用用户启用的工具；plan/build 共用同一份清单。同一会话内工具名与顺序固定，避免切模式改变请求前缀。
4. **模式只 gate 执行**：plan 模式下写工具仍在清单里，宿主在 `withModeGate` 中返回 `PLAN_MODE_READ_ONLY`，页面执行器收不到这次调用。模型看得到工具，也知道调用会被拒。
5. **系统提示词会话内稳定**：时间、图表选择等易变内容不进入 system prompt，而是作为本轮用户消息前的 `turnContext` 注入；tools + system 前缀跨 run 保持一致。
6. **呈现方式由工具声明**：需要非默认视图的工具写 `presentation: 'question'`，宿主按这个字段渲染提问卡片；缺省是普通折叠行。视图不认识任何工具名，新增同类工具不需要改渲染层。声明随 `details` 落到运行中槽位与最终结果，刷新后仍能还原。

### 执行策略

`executionMode` 由 `effect` 推导：只读工具并行，写工具串行，同一资源只有一种并发语义。

### 字段校验

扁平 schema 无法表达「按 action 必填」，因此 `requireFields` 在分发前显式校验并点名缺失字段（例如 `action=add requires indicator`），让模型直接修正下一次调用；`rejectUnusedFields` 同时拒绝当前 action 不接受的字段，避免错放的参数被静默忽略。

### 指标寻址与输入契约

指标输入是「按定义声明」而不是工具自带的开放字典，因此：

- **位置寻址，不暴露实例 ID**：`indicators_list` 返回 `indicator`（规范 ID）、`name`（显示名）、`inputs`、`row`、`order`、`placement`；写工具用 `target: { indicator, row?, order? }` 定位。`row` 是显示行（0 是最上面一行，主图可能在任何行）；`placement` 是主图/副图身份，直接由 `MAIN_PANE_ID` 决定，不从行号推导。`order` 是同一行内的第几个。同名多实例时先按 `indicator`，再按 `row` / `order` 收敛；命中多个就报全部候选，不猜。
- 输入声明只来自 `indicatorCatalog` 的 `IndicatorInputDef`（键、类型、默认值、范围、选项），工具不维护第二份清单。
- `add` 接受部分输入，未给出的键取定义默认值；`update` 的 `inputs` 是**完整集合**，整体替换，避免隐式合并让模型猜不到结果。换指标类型走 `remove` + `add`。
- 校验失败时必须带回可执行信息：未知键列出合法键与约束；`update` 缺键时直接附上当前实例输入，模型不需要额外调用 `indicators_list` 也能补齐重试。
- `move` 只移动指标实例（行号是显示行，0 是最上面一行；主图可能不在 0），不移动 Pane；越界直接报错而不是静默截断。
- 不暴露 `clear`：清空牵连副图回收、主图语义与绘图历史，收益低且破坏面大，保留给产品按钮。
- **读取与写入共用计算身份**：`indicator_series_query` 不带 `inputs` 时读图上实例，带 `inputs` 时提交一次预览计算；两者经过同一个执行器与结果仓库，结果形状一致（列、行、绘图对象、水平线），截断时报告省略数量。

### 图元寻址与时间契约

- **窗格 = 显示行，图元 = 系统分配的 id**：`drawings_list` 返回 `id / kind / row / anchors / style / labels / visible / locked / zIndex / timeframeVisibility / visibleInCurrentPeriod`。`row` 来自图表布局（0 是最上面一行，主图可能在任何行），不从指标实例推导；`id` 由 `create` 返回，后续 `update` / `delete` 只做引用。
- **时间只有一种写法**：RFC 3339 带偏移量，时区取图表当前时区。读到的字符串可以原样写回，模型不做换算；日线及以上允许只写 `YYYY-MM-DD`，日内周期只给日期直接报错，避免所有锚点落到当天首根 K 线。
- **锚点按种类分轴**：锚点数量与所需坐标轴来自 `DRAWING_KIND_SPECS`，工具描述由它生成。垂直线只有 `time`，水平线只有 `price`，其余种类两者都有；该种类不用的轴出现在入参里即报错。
- **`update` 只改属性**：style / labels / visible / locked / zIndex / timeframeVisibility；几何变化走 delete + create，避免读写两侧锚点形状不一致。
- **失败不伪装成成功**：未知 `row`、未知 `id`、锁定图元、锚点形状错误都抛稳定错误码，并带回有效行、当前图元身份或该种类需要的锚点形状。
- 不暴露 `clear` 与 `copy`：前者是没有范围界定的批量删除，后者能用 create 表达。

### 对比品种契约

- **投影而不是领域对象**：`comparisons_list` / `create` 只返回 `identity / symbol / name / exchange / source / instrumentType / color / visible`。`instrument`、`capabilities`、`params`、`startDate`、`endDate`、`incremental` 等字段模型用不到，不进入结果。
- **路由字段与 `instruments_query` 同构**：`create` 接收 `symbol` 与可选的 `exchange` / `source` / `instrumentType`；`source` 省略时跨全部已启用源解析。歧义候选只暴露同一组字段，可原样回传；`id` 不再是候选字段。
- **周期与复权不是对比参数**：对比线恒随主图当前周期与复权，`create` 不接受 `period` / `adjust`，Agent 与 UI 共用同一条取数规则。
- **显隐只有一个写入口**：`update { identity, visible }` 与图例开关都走 `ComparisonCommands.setVisible`，不再各自写 kernel。
- **删除只用 identity**：找不到时抛 `COMPARISON_NOT_FOUND`；重复品种抛 `COMPARISON_DUPLICATE` 并在 `details` 带回既有身份；不暴露 `clear`。
- **有源失败不等于不存在**：目录查询返回 `searchedSources` 与 `failedSources`，无候选但有失败源时抛 `FETCH_FAILED`，不报 `INSTRUMENT_NOT_FOUND`。

## 后果

- 工具名、参数与描述集中在一处，新增工具只改工具目录；领域类保持不变。
- 工具目录取代 `@Tool`、`registeredChartTools`、`ChartToolSafety`、`reversible` 与两处重复过滤。
- `ChartPaneFacade` 只保留布局；指标实例命令归 `ChartIndicatorFacade`，`PaneManager` 仍是唯一事务写入者。
- 工具描述是模型唯一可见的说明，读写拆分让每只工具能给出诚实的副作用声明。
