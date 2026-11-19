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
| 宿主（vue） | 按 `mode` 与用户勾选解析本轮工具，作为唯一裁剪点 |

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
| `indicator_values_query` | read | 指标数值序列 |

共 10 只图表工具；浏览器宿主再加 `web_search` 与 `ask_user`，模型可见 12 只。`code_interpreter` 已在 agent-runtime 实现，由宿主按需装配。

### 硬约束

1. **身份只出不进**：`add` 只接收指标名称、参数与落点，实例与容器身份由状态分配；内部实例 ID 与 `paneId` 都不出现在工具入参里。
2. **落点是语义不是容器**：窗格身份就是显示行 `row`，`paneId` 与指标实例 ID 都不出现在任何工具契约里。
3. **模式只过滤一次**：`resolveTools({ mode, enabled })` 是唯一裁剪点；`plan` 只保留 `effect === 'read'`，`build` 全量。Provider 与注册表只消费解析结果。
4. **提示词从清单推导**：能力说明看本轮是否提供了 `effect === 'write'` 的工具，而不是再看一次 `mode`。模式只剩“挑工具”一个消费点，提示词不会和清单漂移。
5. **呈现方式由工具声明**：需要非默认视图的工具写 `presentation: 'question'`，宿主按这个字段渲染提问卡片；缺省是普通折叠行。视图不认识任何工具名，新增同类工具不需要改渲染层。声明随 `details` 落到运行中槽位与最终结果，刷新后仍能还原。

### 执行策略

`executionMode` 由 `effect` 推导：只读工具并行，写工具串行，同一资源只有一种并发语义。

### 字段校验

扁平 schema 无法表达「按 action 必填」，因此 `requireFields` 在分发前显式校验并点名缺失字段（例如 `action=add requires indicator`），让模型直接修正下一次调用；`rejectUnusedFields` 同时拒绝当前 action 不接受的字段，避免错放的参数被静默忽略。

### 指标寻址与参数契约

指标参数是「按定义声明」而不是工具自带的开放字典，因此：

- **位置寻址，不暴露实例 ID**：`indicators_list` 返回 `indicator / row / order / placement`；写工具用 `target: { indicator, row?, order? }` 定位。`row` 是显示行（0 是最上面一行，主图可能在任何行）；`placement` 是主图/副图身份，直接由 `MAIN_PANE_ID` 决定，不从行号推导。`order` 是同一行内的第几个。同名多实例时先按 `indicator`，再按 `row` / `order` 收敛；命中多个就报候选，不猜。
- 参数声明只来自 `indicatorCatalog` 的 `IndicatorParamDef`（键、类型、默认值、范围、选项），工具不维护第二份清单。
- `add` 接受部分参数，未给出的键取定义默认值；`update` 的 `params` 是**完整参数集**，整体替换，避免隐式合并让模型猜不到结果。换指标类型走 `remove` + `add`。
- 校验失败时必须带回可执行信息：未知键列出合法键与约束；`update` 缺键时直接附上当前实例参数，模型不需要额外调用 `indicators_list` 也能补齐重试。
- `move` 只移动指标实例（行号是显示行，0 是最上面一行；主图可能不在 0），不移动 Pane；越界直接报错而不是静默截断。
- 不暴露 `clear`：清空牵连副图回收、主图语义与绘图历史，收益低且破坏面大，保留给产品按钮。

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
