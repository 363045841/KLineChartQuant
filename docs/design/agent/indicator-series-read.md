# 指标序列读取：单一结果仓库与类型化投影

## 背景

`indicator_values_query` 对脚本指标只返回 `plots / drawings / hlines` 的对象计数，Agent 拿不到任何数值。根因不是少了一个格式化分支，而是读路径缺少三样东西：

1. 计算结果的读取契约是 `unknown`，格式化器靠“数组 / 等长数组对象”嗅探形状，其它一律降级为对象外壳；
2. 查询自己新起一次无状态计算，不带行情上下文，与图表实例的执行路径不同源；
3. 输入契约只接受数字，而脚本的 `input.bool` / `input.string` 在实例里是一等公民。

结果是“成功返回一张计数表”：模型判定脚本没生效，重写脚本、再次查询，最终放弃脚本改为手算行情。

## 决策

### 1. 名词对齐脚本 API

- 一次计算的完整输出叫 `series`（`IndicatorSeries`，原 `IndicatorSeries`）。
- 参数声明与取值统一叫 `inputs`（对应脚本 `input.*`）。
- `series` 内部保留 `plots` / `drawings` / `hlines` 三种产出，不使用第二套叫法。

图表实例的持久化配置（kernel `IndicatorInstance.params` 与布局文档）保持 `params`：那是持久化契约，不参与计算身份命名。计算身份、工具契约与结果模型只出现 `inputs`。

### 2. 结果仓库是唯一事实来源

`IndicatorResultStore` 按计算身份（`definitionId + inputs + context`）保存已提交结果，并提供 `publish / get / retain / snapshot`。区分三个发布物：

| 名称 | 含义 |
| --- | --- |
| `IndicatorResult` | 一次计算的已提交结果：时间轴、修订号、`series` 与可选错误 |
| `IndicatorSeriesPool` | 当前实例计划的结果快照，按 `instanceId` 索引，供渲染消费 |
| 结果仓库 | 上述两者的底层存储；图表池只是它按计划过滤后的投影 |

### 3. 图表实例与预览共用一条执行路径

`IndicatorCalculationScheduler` 对外只有 `refresh`（按计划刷新，不返回等待句柄）、`submit`（提交单个计算身份）、`get`（读已发布结果）：

- 图上实例：`refresh` 把计划任务合并进 lane，运行项不因行情更新被取消，只替换尚未开始的待执行项；
- 预览（不在图上的输入组合）：`submit` 走同一个执行器与同一个仓库，但不进入图表结果池；
- 同一身份同时被图与预览需要时复用正在运行或已发布的结果，不重复计算。

读取方一律以 `dataRevision + marketRevision` 判断结果是否有效，不猜、不轮询。

### 4. 投影是纯函数，且只有一种形状

`projectIndicatorSeries(result, { from, to, limit, period, timezone })` 把 `series` 投影为：

```ts
{
  series: { columns: [{ id, label, kind, location?, text?, char? }], rows: [[index, time, ...values]] },
  objects: [{ kind, index, time, price, text }],
  hlines: [{ id, price, title }],
  truncated?: { rows, objects }
}
```

- 列来自 `plots[].id / label / kind`；OHLC 展开为 `id.open / id.high / id.low / id.close`；
- `offset` 在取值时扣除，`index` 就是脚本里的 `barIndex`；
- 标记类通道在列声明里保留 `location / text / char`，行里给出位置与数值；
- 一个 `limit` 同时约束行与对象，截断时报告省略数量；
- 时间按周期分流：日线及以上 `YYYY-MM-DD`，日内带偏移的 RFC 3339，与行情工具一致。

`series` 不是可读序列时直接抛 `INDICATOR_OUTPUT_UNREADABLE`，恢复提示只给可执行动作（给脚本补 `plot.*`），不再退化成计数表；计算结果失败抛 `INDICATOR_COMPUTE_FAILED`，带回计算器给出的原因。

### 5. 删除的旧结构

- `IndicatorTextFormatContext.series: unknown` 与 `IndicatorTextFormatter`；
- `formatIndicatorMarkdown` 的形状嗅探与 `flattenValue` 的 `[N]` 降级；
- `IndicatorQuery` 自己那次 `runtime.compute` 与只收数字的参数模型；
- `scheduler.compute(): Promise<boolean>`；
- `ChartAgentMarketQueries.indicatorValues`：指标读取属于指标命令面，不属于行情查询。

## 后果

- 读到的就是图上那份：同一实例、同一输入、同一修订，不再有第二条计算路径。
- 不认识的输出会失败并说明原因，不会伪装成成功。
- 脚本作者把值放进 `plot.*` 就能被读取；`label / line / box` 与 `hline` 同样可读。
- 布局持久化仍使用 `params`；除此之外，指标计算与工具契约只使用 `inputs`。
