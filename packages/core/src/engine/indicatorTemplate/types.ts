/**
 * 指标模板契约层：模板文档形状、列表摘要与管理接口；实现位于 impl/。
 *
 * @remarks
 * 模板只保存「指标组合」——每个实例的定义、参数、所在窗格与副图顺序。
 * 商品、周期、图表设置、绘图、视口与价格轴都不属于模板，它们留在布局文档里。
 * 因此模板可以跨图表复用，而布局是整张图表的快照。
 */

import type { ReadonlySignal } from '../../foundation/reactivity/signal.js'
import type { ChartWorkspaceId } from '../../foundation/types/chartView.js'
import type { LayoutWorkspace } from '../layout/types.js'

/** 模板文档版本；Alpha 阶段只接受当前版本，不迁移旧文档。 */
export const INDICATOR_TEMPLATE_VERSION = 1

/**
 * 单个数据视图的指标组合。
 *
 * @remarks
 * 从布局工作区投影：模板只取指标实例与窗格顺序/高度，轴类型等布局专属字段
 * 不进模板。布局工作区增删字段时，差异会直接在这里暴露，不会静默继承。
 */
export type TemplateWorkspace = Pick<LayoutWorkspace, 'instances' | 'paneSpecs'>

/** K 线与分时两个视图的指标组合。 */
export type TemplateWorkspaces = Readonly<Record<ChartWorkspaceId, TemplateWorkspace>>

/** 一份具名指标模板。 */
export interface IndicatorTemplateDocument {
  readonly version: typeof INDICATOR_TEMPLATE_VERSION
  readonly workspaces: TemplateWorkspaces
}

/** 归档在模板上附加身份；运行时状态不复制模板内容。 */
export interface NamedIndicatorTemplate extends IndicatorTemplateDocument {
  readonly id: string
  readonly name: string
}

/** 列表项：只暴露列表需要的字段，不复制模板内容。 */
export interface IndicatorTemplateSummary {
  readonly id: string
  readonly name: string
  /** 模板内各指标的 name 元数据，按出现顺序去重；多实例合并为「名称 x N」。 */
  readonly labels: ReadonlyArray<string>
  /** 模板内指标实例总数，供列表展示规模。 */
  readonly instanceCount: number
}

/** 当前图表中的一个指标定义摘要；id 用于保存时过滤，label 为 name 元数据。 */
export interface IndicatorTemplateIndicator {
  readonly id: string
  readonly label: string
  /** 同一定义在当前图表中的实例数。 */
  readonly count: number
}

/** 模板归档的持久化形状；按模板身份索引，不含「当前模板」概念。 */
export interface IndicatorTemplateArchive {
  readonly documents: Readonly<Record<string, NamedIndicatorTemplate>>
  /** 最近应用过的模板身份，最新在前；用于弹层的「最近用过」分组。 */
  readonly recentIds: ReadonlyArray<string>
}

/** 应用模板的结果；被跳过的指标用于界面提示，不静默丢弃。 */
export interface IndicatorTemplateApplyResult {
  /** 成功恢复的指标实例数。 */
  readonly applied: number
  /** 模板引用但当前无法注册的指标定义 ID，去重保序。 */
  readonly skipped: ReadonlyArray<string>
}

/** 控制器与 UI 消费的模板管理入口。 */
export interface IndicatorTemplateApi {
  /** 当前模板列表，按创建顺序稳定输出。 */
  readonly templates: ReadonlySignal<ReadonlyArray<IndicatorTemplateSummary>>
  /** 最近应用过的模板身份，最新在前。 */
  readonly recentTemplateIds: ReadonlySignal<ReadonlyArray<string>>
  /**
   * 当前图表用户指标的摘要。
   *
   * @remarks
   * 与模板列表共用同一名称汇总规则；保存对话框直接消费，界面不再自行推导。
   */
  readonly currentIndicators: ReadonlySignal<ReadonlyArray<IndicatorTemplateIndicator>>
  /** 读取归档并返回最新列表；首次调用时初始化存储。 */
  listTemplates(): Promise<ReadonlyArray<IndicatorTemplateSummary>>
  /**
   * 保存当前图表的指标组合。
   *
   * @param input.name 模板名称，去空白后不能为空；与已有模板同名时覆盖该模板。
   * @param input.indicatorIds 只保存这些指标定义；省略时保存当前图表全部指标。
   * @returns 写入后的模板身份。
   */
  saveTemplate(input: { name: string; indicatorIds?: ReadonlyArray<string> }): Promise<string>
  /** 修改模板名称；目标不存在或新名称为空时抛错。 */
  renameTemplate(input: { id: string; name: string }): Promise<void>
  /** 删除模板；目标不存在时抛错。 */
  deleteTemplate(input: { id: string }): Promise<void>
  /**
   * 把模板的指标组合应用到当前图表。
   *
   * @remarks
   * 替换图上现有的用户指标，不追加；商品、周期、设置、绘图与视口保持不变。
   * 模板引用但已无法注册的指标会被跳过，其余照常恢复。
   */
  applyTemplate(input: { id: string }): Promise<IndicatorTemplateApplyResult>
}
