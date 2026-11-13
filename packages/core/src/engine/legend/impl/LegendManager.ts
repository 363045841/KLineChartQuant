/** 图例唯一管理入口：实例行投影、菜单目标投影与宿主界面请求。 */

import { isIndicatorVisibleOnPeriod } from '@/engine/indicators/indicatorPeriodVisibility.js'
import {
  INDICATOR_INSTANCE_CATALOG_SERVICE,
  type IndicatorInstanceCatalog,
} from '@/engine/indicators/instances/api/indicatorRenderBinding.js'
import { getIndicatorDescriptor } from '@/engine/indicators/pipeline/index.js'
import { resolvePaneMoveIndex } from '@/engine/pane/impl/paneOrder.js'
import { runInNewPane } from '@/engine/pane/index.js'
import type { InstanceMoveTarget } from '@/engine/pane/types.js'
import { INSTANCE_MOVE_KIND, MAIN_PANE_ID } from '@/engine/pane/types.js'
import type { RenderContext } from '@/foundation/plugin/index.js'
import { batch, createSignal, type ReadonlySignal } from '@/foundation/reactivity/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { isKLineDataArray } from '@/foundation/types/price.js'
import type {
  CreateLegendInput,
  LegendAction,
  LegendApi,
  LegendEntry,
  LegendManagerDependencies,
  LegendMoveOption,
  LegendMoveTarget,
  LegendPatch,
  LegendRow,
  LegendTemplateContext,
  LegendUiRequest,
} from '../types.js'
import { projectLegendColors } from './legendColors.js'
import { type LegendRowContent, layoutLegendRows } from './legendRow.js'
import { projectLegendActions } from './projectLegendActions.js'
import { projectIndicator, projectLegendContext } from './projectLegendContext.js'
import { projectIndicatorTexts, projectMainLegendContents } from './projectLegendRows.js'
import { resolveLegendValueIndex } from './resolveLegendValueIndex.js'

/** 管理内置图例的领域操作及自定义图例；每帧原子发布完整投影。 */
export class LegendManager implements LegendApi {
  private disposed = false
  private readonly contextState = createSignal<LegendTemplateContext | null>(null)
  private readonly rowsState = createSignal<ReadonlyArray<LegendRow>>([])
  private readonly collapsedState = createSignal(false)
  private readonly customState = createSignal<
    ReadonlyArray<Extract<LegendEntry, { kind: 'custom' }>>
  >([])
  readonly context: ReadonlySignal<LegendTemplateContext | null> = this.contextState
  readonly rows: ReadonlySignal<ReadonlyArray<LegendRow>> = this.rowsState
  /** 主图图例整块收起；只影响默认 DOM，行数据仍完整发布。 */
  readonly mainCollapsed: ReadonlySignal<boolean> = this.collapsedState
  /** 帧事务直接追踪自定义配置引用，配置变化不会被缓存帧跳过。 */
  readonly configuration: ReadonlySignal<ReadonlyArray<LegendEntry>> = this.customState

  /** 注入所属领域，创建实例级图例管理器。 */
  constructor(private readonly deps: LegendManagerDependencies) {}

  /**
   * 切换主图图例整块收起。
   * 行内容不变，只改变默认 DOM 显隐。
   */
  setMainCollapsed(collapsed: boolean): void {
    if (this.disposed || this.collapsedState.peek() === collapsed) return
    if (collapsed && !this.canCollapse()) return
    this.collapsedState.set(collapsed)
    this.deps.requestRender()
  }

  /** 主图有指标行且已选品种时，收起控件才有意义。 */
  canCollapse(): boolean {
    if (!this.deps.hasPrimarySymbol()) return false
    return this.rowsState
      .peek()
      .some((row) => row.paneId === MAIN_PANE_ID && row.indicator !== undefined)
  }

  /** 从当前领域状态枚举图例，不依赖是否已有行情或已绘制一帧。 */
  list(): ReadonlyArray<LegendEntry> {
    if (this.disposed) return []
    const catalog = this.deps.host.getService<IndicatorInstanceCatalog>(
      INDICATOR_INSTANCE_CATALOG_SERVICE,
    )
    const entries: LegendEntry[] = []
    for (const instance of catalog?.listInstances() ?? [])
      entries.push({
        id: instance.instanceId,
        kind: 'indicator',
        paneId: instance.paneId,
        definitionId: instance.definitionId,
        hidden: instance.hidden,
        params: instance.params,
      })
    for (const comparison of this.deps.comparisons.list())
      entries.push({
        id: `comparison:${comparison.identity}`,
        kind: 'comparison',
        paneId: MAIN_PANE_ID,
        identity: comparison.identity,
        spec: comparison.spec,
        hidden: this.deps.getComparisonHidden(comparison.identity),
      })
    return [...entries, ...this.customState.peek()]
  }

  /** 按稳定图例 ID 查询；不存在时返回 null。 */
  get(id: string): LegendEntry | null {
    return this.list().find((entry) => entry.id === id) ?? null
  }

  /** 创建领域内容或自定义展示行，返回稳定图例 ID。 */
  create(input: CreateLegendInput): string | null {
    if (this.disposed) return null
    if (input.kind === 'indicator') return this.deps.panes.add(input.definitionId, input.params)
    if (input.kind === 'comparison') return this.createComparison(input)
    return this.createCustom(input)
  }

  /** 添加比较品种并返回其规范图例 ID。 */
  private createComparison(
    input: Extract<CreateLegendInput, { kind: 'comparison' }>,
  ): string | null {
    if (!this.deps.comparisons.add(input.spec, input.primary)) return null
    const entry = this.deps.comparisons
      .list()
      .find((item) => item.spec.symbol === input.spec.symbol)
    return entry ? `comparison:${entry.identity}` : null
  }

  /** 登记仅由图例持有的自定义展示行。 */
  private createCustom(input: Extract<CreateLegendInput, { kind: 'custom' }>): string | null {
    const id = `custom:${input.id}`
    if (!input.id || this.get(id) || !this.deps.panes.hasPane(input.paneId)) return null
    this.customState.set([
      ...this.customState.peek(),
      { ...input, id, texts: input.texts.map((text) => ({ ...text })), hidden: false },
    ])
    this.deps.requestRender()
    return id
  }

  /** 更新参数、显隐或自定义文本；不适用的字段拒绝写入。 */
  update(id: string, patch: LegendPatch): boolean {
    const entry = this.get(id)
    if (!entry) return false
    if ((patch.texts && entry.kind !== 'custom') || (patch.params && entry.kind !== 'indicator'))
      return false
    if (entry.kind === 'custom') {
      this.customState.set(
        this.customState.peek().map((item) =>
          item.id === id
            ? {
                ...item,
                hidden: patch.hidden ?? item.hidden,
                texts: patch.texts?.map((text) => ({ ...text })) ?? item.texts,
              }
            : item,
        ),
      )
      this.deps.requestRender()
      return true
    }
    if (entry.kind === 'indicator')
      return this.deps.panes.updateInstance(entry.id, {
        ...(patch.params ? { params: patch.params } : {}),
        ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
      })
    if (patch.hidden !== undefined) this.deps.setComparisonHidden(entry.identity, patch.hidden)
    return true
  }

  /** 删除图例及其所属领域内容；空副图由命令面回收。 */
  remove(id: string): boolean {
    const entry = this.get(id)
    if (!entry) return false
    if (entry.kind === 'indicator') return this.deps.panes.removeInstance(entry.id)
    if (entry.kind === 'comparison')
      return this.deps.comparisons.remove({ identity: entry.identity })
    this.customState.set(this.customState.peek().filter((item) => item.id !== id))
    this.deps.requestRender()
    return true
  }

  /** 移动指标在所属 Pane 内的顺序，或同 Pane 的自定义行；比较品种暂不支持排序。 */
  move(id: string, direction: 'up' | 'down'): boolean {
    const entry = this.get(id)
    if (!entry || entry.kind === 'comparison') return false
    if (entry.kind === 'indicator') return this.moveIndicator(entry, direction)
    return this.moveCustomRow(entry, direction)
  }

  /** 指标在同一 Pane 内换位；目标序号交给唯一的移动命令。 */
  private moveIndicator(
    entry: Extract<LegendEntry, { kind: 'indicator' }>,
    direction: 'up' | 'down',
  ): boolean {
    const catalog = this.deps.host.getService<IndicatorInstanceCatalog>(
      INDICATOR_INSTANCE_CATALOG_SERVICE,
    )
    const instances = catalog?.listPaneInstances(entry.paneId) ?? []
    const index = instances.findIndex((instance) => instance.instanceId === entry.id)
    const targetIndex = index + (direction === 'up' ? -1 : 1)
    // 首项上移、末项下移都是无操作，保持原按钮的可用性语义。
    if (index < 0 || targetIndex < 0 || targetIndex >= instances.length) return false
    return this.deps.panes.moveInstance(entry.id, {
      kind: INSTANCE_MOVE_KIND.PANE,
      paneId: entry.paneId,
      index: targetIndex,
    })
  }

  /** 迁移实例到菜单选择的目标；新建 Pane 时先建后移，空副图由命令面回收。 */
  moveTo(id: string, target: LegendMoveTarget): boolean {
    const entry = this.get(id)
    if (entry?.kind !== 'indicator') return false
    if (target.kind !== 'newPane') return this.deps.panes.moveInstance(entry.id, target)
    return runInNewPane(this.deps.panes, target.anchorPaneId, target.placement, (paneId) =>
      this.deps.panes.moveInstance(entry.id, {
        kind: INSTANCE_MOVE_KIND.PANE,
        paneId,
      }),
    )
  }

  /** 自定义行在同一 Pane 内与相邻行换位。 */
  private moveCustomRow(
    entry: Extract<LegendEntry, { kind: 'custom' }>,
    direction: 'up' | 'down',
  ): boolean {
    const current = [...this.customState.peek()]
    const samePane = current.filter((item) => item.paneId === entry.paneId)
    const index = samePane.findIndex((item) => item.id === entry.id)
    const other = samePane[index + (direction === 'up' ? -1 : 1)]
    if (!other) return false
    const left = current.findIndex((item) => item.id === entry.id)
    const right = current.findIndex((item) => item.id === other.id)
    current[left] = other
    current[right] = entry
    this.customState.set(current)
    this.deps.requestRender()
    return true
  }

  /** 原位替换指标图例及其领域内容。 */
  replace(id: string, definitionId: string): boolean {
    const entry = this.get(id)
    if (entry?.kind !== 'indicator') return false
    return this.deps.panes.updateInstance(entry.id, { indicatorId: definitionId })
  }

  /** 执行图例按钮操作；设置、替换与脚本编辑返回宿主界面请求。 */
  execute(id: string, action: LegendAction): LegendUiRequest | null {
    const entry = this.get(id)
    if (!entry) return null
    if (action === 'close') this.remove(id)
    else if (action === 'toggle-visibility') this.update(id, { hidden: !entry.hidden })
    else if (action === 'move-up' || action === 'move-down')
      this.move(id, action === 'move-up' ? 'up' : 'down')
    else if (action === 'move-pane-up' || action === 'move-pane-down') {
      const direction = action === 'move-pane-up' ? 'up' : 'down'
      const index = resolvePaneMoveIndex(this.deps.panes.getLayoutSpecs(), entry.paneId, direction)
      if (entry.kind === 'indicator' && index !== null)
        this.deps.panes.movePane(entry.paneId, index)
    } else if (action === 'move-to') {
      if (entry.kind !== 'indicator') return null
      return { action: 'move-to', id, options: this.moveOptions(entry) }
    } else if (entry.kind === 'indicator')
      return {
        action,
        id,
        paneId: entry.paneId,
        definitionId: entry.definitionId,
        role: entry.paneId === MAIN_PANE_ID ? 'main' : 'sub',
      }
    return null
  }

  /** 菜单目标：主图、已有副图（首实例名）与锚点上下新建。 */
  private moveOptions(entry: Extract<LegendEntry, { kind: 'indicator' }>): LegendMoveOption[] {
    const catalog = this.deps.host.getService<IndicatorInstanceCatalog>(
      INDICATOR_INSTANCE_CATALOG_SERVICE,
    )
    const options: LegendMoveOption[] = [
      {
        target: { kind: INSTANCE_MOVE_KIND.MAIN },
        label: '移至主图',
        enabled: entry.paneId !== MAIN_PANE_ID,
      },
    ]
    for (const pane of this.deps.panes.getLayoutSpecs()) {
      if (pane.id === MAIN_PANE_ID || pane.id === entry.paneId) continue
      const first = catalog?.listPaneInstances(pane.id)[0]
      if (!first) continue
      const name = getIndicatorDescriptor(first.definitionId)?.displayName ?? first.definitionId
      options.push({
        target: { kind: INSTANCE_MOVE_KIND.PANE, paneId: pane.id },
        label: `移至 ${name}`,
        enabled: true,
      })
    }
    options.push(
      {
        target: {
          kind: 'newPane',
          anchorPaneId: entry.paneId,
          placement: 'above',
        },
        label: '在上方新建副图',
        enabled: true,
      },
      {
        target: {
          kind: 'newPane',
          anchorPaneId: entry.paneId,
          placement: 'below',
        },
        label: '在下方新建副图',
        enabled: true,
      },
    )
    return options
  }

  /** 为所有可见 Pane 生成一份完整图例快照，避免主副图分别发布。 */
  projectFrame(contexts: ReadonlyArray<RenderContext>): void {
    if (this.disposed) return
    const template = this.projectMainTemplate(contexts)
    const rows = this.withActions(this.collectFrameRows(contexts, template), contexts)
    const canCollapse = this.canCollapseRows(rows)
    if (!canCollapse && this.collapsedState.peek()) this.collapsedState.set(false)
    batch(() => {
      this.contextState.set(
        template ? { ...template, rows: rows.filter((row) => row.paneId === MAIN_PANE_ID) } : null,
      )
      this.rowsState.set(rows)
    })
  }

  /** 主图有指标行且已选品种时才允许整块收起。 */
  private canCollapseRows(rows: ReadonlyArray<LegendRow>): boolean {
    return (
      this.deps.hasPrimarySymbol() &&
      rows.some((row) => row.paneId === MAIN_PANE_ID && row.indicator !== undefined)
    )
  }

  /** 主图模板：只投影行情与比较行，指标行由统一实例投影追加。 */
  private projectMainTemplate(
    contexts: ReadonlyArray<RenderContext>,
  ): LegendTemplateContext | null {
    const main = contexts.find((context) => context.pane.id === MAIN_PANE_ID)
    if (!main) return null
    return projectLegendContext({ context: main, host: this.deps.host })
  }

  /** 汇总所有 Pane 的展示行：主图行情装饰、统一实例行与自定义行。 */
  private collectFrameRows(
    contexts: ReadonlyArray<RenderContext>,
    template: LegendTemplateContext | null,
  ): LegendRow[] {
    const rows: LegendRow[] = []
    for (const context of contexts) {
      const paneId = context.pane.id
      const mainTemplate = paneId === MAIN_PANE_ID ? template : null
      const contents = [
        ...(mainTemplate ? projectMainLegendContents(mainTemplate) : []),
        ...this.collectInstanceContents(context),
        ...this.collectCustomContents(paneId),
      ]
      rows.push(
        ...layoutLegendRows(
          { paneId, paneTop: context.pane.top, paneWidth: context.paneWidth },
          contents,
          mainTemplate
            ? {
                inset: mainTemplate.layout.x,
                height: mainTemplate.layout.lineHeight,
                gap: mainTemplate.layout.gap,
              }
            : undefined,
        ),
      )
    }
    return rows
  }

  /** 指标在当前周期是否进入图例；未声明可见范围时恒为真。 */
  private isVisibleOnPeriod(definitionId: string, period: RenderContext['period']): boolean {
    const descriptor = getIndicatorDescriptor(definitionId)
    return isIndicatorVisibleOnPeriod(period, descriptor?.visiblePeriods)
  }

  /** 统一实例行：主图与副图从同一目录、同一投影生成。 */
  private collectInstanceContents(context: RenderContext): LegendRowContent[] {
    const catalog = this.deps.host.getService<IndicatorInstanceCatalog>(
      INDICATOR_INSTANCE_CATALOG_SERVICE,
    )
    const paneId = context.pane.id
    const colors = resolveThemeColors(
      context.theme,
      context.isAsiaMarket,
      context.colorPresetSettings,
    )
    const data = isKLineDataArray(context.data) ? context.data : []
    const index = resolveLegendValueIndex(context.crosshairIndex, context.data.length)
    const rows: LegendRowContent[] = []
    for (const instance of catalog?.listPaneInstances(paneId) ?? []) {
      if (!this.isVisibleOnPeriod(instance.definitionId, context.period)) continue
      const title = projectIndicator(
        instance,
        context.indicatorStateReader,
        context.indicatorAvailability,
        data,
        index,
        colors,
      )
      if (!title) continue
      rows.push({
        key: instance.instanceId,
        indicator: { instanceId: instance.instanceId, definitionId: instance.definitionId },
        hidden: title.hidden,
        loading: title.loading,
        error: title.error,
        texts: projectIndicatorTexts(title, projectLegendColors(colors)),
      })
    }
    return rows
  }

  /** 自定义标题只提供内容，与行情和指标一起排版。 */
  private collectCustomContents(paneId: string): LegendRowContent[] {
    return this.customState
      .peek()
      .filter((entry) => entry.paneId === paneId && !entry.hidden)
      .map((entry) => ({ key: entry.id, texts: entry.texts }))
  }

  /** 为每条展示行补全 Core 端按钮能力。 */
  private withActions(
    rows: ReadonlyArray<LegendRow>,
    contexts: ReadonlyArray<RenderContext>,
  ): LegendRow[] {
    const entriesById = new Map(this.list().map((entry) => [entry.id, entry]))
    const catalog = this.deps.host.getService<IndicatorInstanceCatalog>(
      INDICATOR_INSTANCE_CATALOG_SERVICE,
    )
    const paneInstances = new Map<string, ReadonlyArray<string>>()
    for (const context of contexts) {
      paneInstances.set(
        context.pane.id,
        (catalog?.listPaneInstances(context.pane.id) ?? []).map((item) => item.instanceId),
      )
    }
    const isScriptIndicator = this.deps.isScriptIndicator ?? (() => false)
    const panes = this.deps.panes.getLayoutSpecs()
    return rows.map((row) => {
      const entry = entriesById.get(row.key)
      return {
        ...row,
        actions: entry ? projectLegendActions(entry, paneInstances, isScriptIndicator, panes) : [],
      }
    })
  }

  /** 清空帧投影；领域内容和自定义配置由其生命周期独立管理。 */
  clearFrame(): void {
    batch(() => {
      this.contextState.set(null)
      this.rowsState.set([])
    })
  }

  /** 销毁图例配置与帧快照，后续 CRUD 不再写入已释放的领域。 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    batch(() => {
      this.customState.set([])
      this.contextState.set(null)
      this.rowsState.set([])
      this.collapsedState.set(false)
    })
  }
}
