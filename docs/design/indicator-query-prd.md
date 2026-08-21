<!-- 本文定义指标查询层的需求和接口形状。 -->

# 指标查询层 PRD

## 1. 需求

在 agent 目录下建立独立的指标查询层，为 Controller、UI 或 Agent 适配器提供稳定的指标数据接口。

1. 可以查询任何已注册指标，不要求指标已经添加到图表。
2. 支持按指标定义和参数临时计算，也支持按图表指标实例继承现有参数。
3. 临时计算复用现有 calculator，不添加指标、不创建 pane、不修改图表状态。
4. 相同指标、参数和数据版本已有正式结果时可以复用；复用与临时计算返回相同结构。
5. 默认使用当前图表数据，返回结果必须标明实际数据范围和版本。
6. 单次查询必须限制范围，禁止返回无界历史数据。
7. 查询层不依赖 Agent 工具协议，也不暴露渲染状态、Scheduler 或 Worker 私有对象。

## 2. 查询接口

```ts
interface IndicatorQueryRequest {
  /** 查询的指标来源。 */
  indicator:
    | {
        /** 按指标定义查询。 */
        source: 'definition'
        /** 已注册的指标定义标识。 */
        definitionId: string
        /** 指标参数覆盖，未提供的参数使用默认值。 */
        params?: Readonly<Record<string, number | string | boolean>>
      }
    | {
        /** 按图表指标实例查询。 */
        source: 'instance'
        /** 图表指标实例身份。 */
        instanceId: string
      }
  /** 查询范围。 */
  range: { type: 'latest'; count: number } | { type: 'time'; from: number; to: number }
  /** 是否允许返回最近成功但已过期的结果，默认 false。 */
  allowStale?: boolean
  /** 时间顺序，默认 asc。 */
  order?: 'asc' | 'desc'
}
```

`from` 和 `to` 为包含边界的毫秒时间戳。默认返回最近 100 条，单次最多返回 500 条。

## 3. 返回接口

```ts
interface IndicatorQueryResult {
  /** 结果相对于当前图表数据和配置的可用性。 */
  availability: 'ready' | 'computing' | 'stale' | 'error'
  /** 规范化指标定义标识。 */
  definitionId: string
  /** 图表指标实例身份；按定义查询时为 null。 */
  instanceId: string | null
  /** 本次计算实际使用的完整参数。 */
  params: Readonly<Record<string, number | string | boolean>>
  /** 结果绑定的数据版本。 */
  dataRevision: number
  /** 图表指标配置版本；按定义查询时为 null。 */
  configRevision: number | null
  /** 结果数据集。 */
  datasets: ReadonlyArray<IndicatorQueryDataset>
  /** 是否因记录上限发生截断。 */
  truncated: boolean
  /** 查询失败说明，非 error 状态为 null。 */
  error: { code: string; message: string } | null
}

interface IndicatorQueryDataset {
  /** 数据集稳定名称。 */
  name: string
  /** 数据与 K 线的对齐方式。 */
  shape: 'bar-aligned' | 'aggregate'
  /** 有顺序的字段定义。 */
  fields: ReadonlyArray<{
    /** 稳定字段名称。 */
    name: string
    /** 字段数据类型。 */
    type: 'number' | 'string' | 'boolean' | 'timestamp'
    /** 数值单位，无单位时省略。 */
    unit?: string
  }>
  /** 每条记录按 fields 顺序保存单元格。 */
  records: ReadonlyArray<ReadonlyArray<number | string | boolean | null>>
  /** 逐根结果首次整体可用的原始序列下标；聚合结果为 null。 */
  firstReadyIndex: number | null
}
```

## 4. 返回规则

1. 逐根结果第一列为毫秒时间戳，并与 K 线严格对齐。
2. `null` 表示预热不足或没有结果，`0` 只表示真实零值。
3. 聚合指标必须标记为 `aggregate`，不得伪造成逐根数据。
4. 旧结果不能标记为 `ready`；只有请求明确允许时才能携带过期数据集。
5. 查询层只从正式实例结果和时间轴构造返回值，或调用现有 calculator 临时计算。

## 5. 调用边界

指标查询层是 Core 领域能力，不感知 Agent 工具名称、参数结构或返回包装。Agent runtime 需要自行适配该接口；
Controller 和 UI 也可以直接使用同一领域接口。
