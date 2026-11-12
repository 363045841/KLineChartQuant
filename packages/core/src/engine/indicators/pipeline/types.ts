/**
 * 指标注册管线契约：收集（collect）→ 编译（compile）→ 注册（register）。
 *
 * 三段之间只传递数据，不共享可变状态：收集产出候选，编译产出可注册定义，
 * 只有注册阶段写指标仓库并发出一次通知。内置脚本、用户脚本与
 * 第三方注册共用同一组契约，不允许出现旁路写入。
 */
import type { IndicatorSourceDocument } from '@363045841yyt/klinechart-plot-contracts'
import type { ReadonlySignal } from '@/foundation/reactivity/index.js'
import type { ChartDataView } from '../../chartModel/index.js'
import type {
  IndicatorCategory,
  IndicatorInputDef,
  IndicatorMetadata,
  IndicatorPeriodVisibility,
} from '../indicatorMetadata.js'

/** 脚本文档身份：内置只读或用户可编辑。原生指标没有文档身份。 */
export type IndicatorDocumentIdentity = IndicatorSourceDocument['identity']

/** 目录项身份：原生指标没有文档，脚本携带文档身份。 */
export type IndicatorIdentity = 'native' | IndicatorDocumentIdentity

/** 候选来源；决定失败日志的标签与责任归属，不参与注册语义。 */
export type IndicatorOrigin = 'builtin-script' | 'user-script' | 'third-party'

/** 管线阶段名；失败按阶段归类，日志与界面都依赖它定位问题。 */
export type IndicatorStageName = 'collect' | 'compile' | 'register'

/**
 * 静态目录项：选择器、搜索与 Agent 工具结构需要的全部字段；读取时不加载实现（实现懒加载）。
 * 目录来自脚本编译或宿主显式提供的指标描述，不包含系统图层。
 */
export interface IndicatorDescriptor {
  readonly source?: IndicatorMetadata['source']
  readonly name: string
  readonly aliases?: readonly string[]
  readonly displayName: string
  /** 指标选择器/图例显示的长名称；缺省用 displayName。 */
  readonly title?: string
  /** 指标选择器里的说明文本；缺省不展示说明。 */
  readonly info?: string
  readonly category: IndicatorCategory
  readonly defaultPaneId: string
  readonly dataViews?: readonly ChartDataView[]
  /** 指标可见的图表周期范围；缺省表示所有周期可见。 */
  readonly visiblePeriods?: readonly IndicatorPeriodVisibility[]
  /** runtime.defaultParams 的静态值。 */
  readonly defaultParams?: Readonly<Record<string, unknown>>
  /** runtime.inputDefs 的静态值；只含展示声明，默认值仍在 defaultParams。 */
  readonly inputDefs?: Readonly<Record<string, IndicatorInputDef>>
  /** 脚本身份：内置只读或用户可编辑；原生指标没有该字段。 */
  readonly documentIdentity?: IndicatorDocumentIdentity
  /** presentation.defaultOptions 的静态值。 */
  readonly defaultOptions?: Readonly<Record<string, unknown>>
}

/** 懒加载实现的入口；没有加载入口的目录项只做展示。 */
export type IndicatorDefinitionLoader = () => Promise<IndicatorMetadata>

/**
 * 收集阶段产物：描述“有什么”，不包含编译结果。
 *
 * - `key` 是稳定身份：脚本用文档 ID，宿主指标用内部 name；
 * - `sourceText` 只有需要运行时编译的来源才有；
 * - `load` 可由宿主提供，用于懒加载已编译的定义对象。
 */
export interface IndicatorCandidate {
  readonly key: string
  readonly origin: IndicatorOrigin
  readonly identity: IndicatorIdentity
  readonly sourceText?: string
  readonly trusted?: boolean
  readonly load?: IndicatorDefinitionLoader
}

/**
 * 编译阶段产物：已能直接写入注册表的两种形态。
 *
 * - `descriptor`：只登记目录项，可附带懒加载入口；
 * - `definition`：已装配实现的指标（脚本、第三方、懒加载完成的原生指标）。
 */
export type RegistrableIndicator =
  | {
      readonly kind: 'descriptor'
      readonly candidate: IndicatorCandidate
      readonly descriptor: IndicatorDescriptor
      readonly load?: IndicatorDefinitionLoader
    }
  | {
      readonly kind: 'definition'
      readonly candidate: IndicatorCandidate
      readonly definition: IndicatorMetadata
    }

/** 单个候选在某一阶段的失败；失败是数据，不是异常控制流。 */
export interface IndicatorFailure {
  readonly stage: IndicatorStageName
  readonly origin: IndicatorOrigin
  readonly key: string
  readonly name: string
  readonly error: unknown
}

/** 阶段结果：成功携带产物，失败携带唯一一条失败记录。 */
export type StageResult<T> =
  | { readonly ok: true; readonly items: readonly T[] }
  | { readonly ok: false; readonly failure: IndicatorFailure }

/**
 * 收集阶段端口：把某个来源的原始材料变成候选，只读外部状态。
 */
export interface IndicatorCollector {
  readonly origin: IndicatorOrigin
  collect(): Promise<StageResult<IndicatorCandidate>>
}

/**
 * 编译阶段端口：把候选编译成可注册定义。
 *
 * 该阶段可以执行 Worker 编译与契约校验，但不得写注册表；
 * 失败必须作为 `StageResult.failure` 返回，不能抛出中断其它候选。
 */
export interface IndicatorCompiler {
  readonly origin: IndicatorOrigin
  compile(candidate: IndicatorCandidate): Promise<StageResult<RegistrableIndicator>>
}

/** 一个来源的完整支流：收集器 + 编译器；所有来源形状一致。 */
export interface IndicatorStage {
  readonly collector: IndicatorCollector
  readonly compiler: IndicatorCompiler
}

/** 一次注册提交的变更摘要；注册表只通过它通知增量消费者。 */
export interface IndicatorCatalogCommit {
  readonly revision: number
  /** 新装配的完整定义。 */
  readonly added: readonly IndicatorMetadata[]
  /** 已存在定义被替换后的新快照。 */
  readonly updated: readonly IndicatorMetadata[]
  /** 被移除的定义。 */
  readonly removed: readonly IndicatorMetadata[]
  /** 只登记了目录项、实现仍处于懒加载的条目。 */
  readonly described: readonly IndicatorDescriptor[]
}

/** 一次管线运行的产出：成功写入的目录项与全部阶段失败。 */
export interface IndicatorPipelineReport {
  readonly committed: readonly IndicatorDescriptor[]
  readonly failures: readonly IndicatorFailure[]
}

/** 注册表修订号：任意增删改都推进；读取方用它建立失效依赖。 */
export type IndicatorCatalogRevision = ReadonlySignal<number>

/**
 * 最近一次提交的变更摘要；没有提交时为空。
 *
 * 消费者按 `revision` 递增消费，不得假设历史提交可回放；
 * 读取完整状态请使用 `readIndicatorDescriptors` / `readRegisteredDefinitions`。
 */
export type IndicatorCatalogCommitSignal = ReadonlySignal<IndicatorCatalogCommit | null>

/**
 * 启动管线登记的失败清单；运行时单条脚本操作仍以异常返回。
 *
 * 它只代表最近一次管线运行的结果，不累计历史。
 */
export type IndicatorFailureSignal = ReadonlySignal<readonly IndicatorFailure[]>
