/** 图例唯一管理入口：领域 CRUD、主副图帧投影与宿主界面请求。 */
import {
  INDICATOR_INSTANCE_CATALOG_SERVICE,
  type IndicatorInstanceCatalog,
} from '@/engine/indicators/instances/api/indicatorRenderBinding.js'
import { MAIN_PANE_ID, PANE_HEADER_INSET_PX } from '@/engine/pane/types.js'
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
  LegendPatch,
  LegendRow,
  LegendTemplateContext,
  LegendUiRequest,
} from '../types.js'
import { projectLegendActions } from './projectLegendActions.js'
import { projectIndicator, projectLegendContext } from './projectLegendContext.js'
import { projectIndicatorTexts, projectMainLegendRows } from './projectLegendRows.js'
import { resolveLegendValueIndex } from './resolveLegendValueIndex.js'

/** 管理内置图例的领域操作及自定义图例；每帧原子发布完整投影。 */
export class LegendManager implements LegendApi {
  private disposed = false
  private readonly contextState = createSignal<LegendTemplateContext | null>(null)
  private readonly rowsState = createSignal<ReadonlyArray<LegendRow>>([])
  private readonly customState = createSignal<
    ReadonlyArray<Extract<LegendEntry, { kind: 'custom' }>>
  >([])
  readonly context: ReadonlySignal<LegendTemplateContext | null> = this.contextState
  readonly rows: ReadonlySignal<ReadonlyArray<LegendRow>> = this.rowsState
  /** 帧事务直接追踪自定义配置引用，配置变化不会被缓存帧跳过。 */
  readonly configuration: ReadonlySignal<ReadonlyArray<LegendEntry>> = this.customState

  /** 注入所属领域，创建实例级图例管理器。 */
  constructor(private readonly deps: LegendManagerDependencies) {}

  /** 从当前领域状态枚举图例，不依赖是否已有行情或已绘制一帧。 */
  list(): ReadonlyArray<LegendEntry> {
    if (this.disposed) return []
    const catalog = this.deps.host.getService<IndicatorInstanceCatalog>(
      INDICATOR_INSTANCE_CATALOG_SERVICE,
    )
    const entries: LegendEntry[] = []
    for (const pane of this.deps.panes.getLayoutSpecs()) {
      const instances =
        pane.id === MAIN_PANE_ID
          ? catalog?.listMainInstances()
          : catalog?.listPaneInstances(pane.id)
      for (const instance of instances ?? [])
        entries.push({
          id: instance.instanceId,
          kind: 'indicator',
          paneId: instance.paneId,
          definitionId: instance.definitionId,
          hidden: instance.hidden,
          params: instance.params,
        })
    }
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
    if (input.kind === 'indicator') return this.createIndicator(input)
    if (input.kind === 'comparison') return this.createComparison(input)
    return this.createCustom(input)
  }

  /** 启用领域指标并回读其稳定图例 ID。 */
  private createIndicator(input: Extract<CreateLegendInput, { kind: 'indicator' }>): string | null {
    const created = this.deps.indicators.add(input.definitionId, input.role, input.params)
    if (!created) return null
    const entry = this.list().find(
      (item) =>
        item.kind === 'indicator' &&
        (input.role === 'main'
          ? item.paneId === MAIN_PANE_ID && item.definitionId === created
          : item.id === created),
    )
    return entry?.id ?? null
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
    if (!input.id || this.get(id) || !this.deps.panes.has(input.paneId)) return null
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
    let updated = true
    batch(() => {
      if (entry.kind === 'indicator') {
        if (patch.params)
          updated = this.deps.indicators.updateParams(
            entry.paneId === MAIN_PANE_ID ? entry.definitionId : entry.id,
            patch.params,
          )
        if (updated && patch.hidden !== undefined)
          updated =
            entry.paneId === MAIN_PANE_ID
              ? this.deps.indicators.setMainHidden(entry.definitionId, patch.hidden)
              : this.deps.indicators.setSubHidden(entry.paneId, patch.hidden)
      } else if (patch.hidden !== undefined)
        this.deps.setComparisonHidden(entry.identity, patch.hidden)
    })
    return updated
  }

  /** 删除图例及其所属领域内容，副图删除对应 Pane。 */
  remove(id: string): boolean {
    const entry = this.get(id)
    if (!entry) return false
    if (entry.kind === 'indicator')
      return entry.paneId === MAIN_PANE_ID
        ? this.deps.indicators.remove(entry.definitionId)
        : this.deps.panes.remove(entry.paneId)
    if (entry.kind === 'comparison')
      return this.deps.comparisons.remove({ identity: entry.identity })
    this.customState.set(this.customState.peek().filter((item) => item.id !== id))
    this.deps.requestRender()
    return true
  }

  /** 移动指标所属顺序或同 Pane 的自定义行；比较品种暂不支持排序。 */
  move(id: string, direction: 'up' | 'down'): boolean {
    const entry = this.get(id)
    if (!entry || entry.kind === 'comparison') return false
    if (entry.kind === 'indicator') return this.moveIndicator(entry, direction)
    return this.moveCustomRow(entry, direction)
  }

  /** 主图交给指标领域排序，副图交换相邻 Pane。 */
  private moveIndicator(
    entry: Extract<LegendEntry, { kind: 'indicator' }>,
    direction: 'up' | 'down',
  ): boolean {
    if (entry.paneId === MAIN_PANE_ID)
      return this.deps.indicators.moveMain(entry.definitionId, direction)
    const layout = this.deps.panes.getLayoutSpecs()
    const order = layout.filter((pane) => pane.id !== MAIN_PANE_ID)
    const index = order.findIndex((pane) => pane.id === entry.paneId)
    const targetPane = order[index + (direction === 'up' ? -1 : 1)]
    if (index < 0 || !targetPane) return false
    return this.deps.panes.move(
      entry.paneId,
      layout.findIndex((pane) => pane.id === targetPane.id),
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
    return entry.paneId === MAIN_PANE_ID
      ? this.deps.indicators.replaceMain(entry.definitionId, definitionId)
      : this.deps.panes.replaceContent(entry.paneId, definitionId, {})
  }

  /** 执行图例按钮操作，仅设置和替换返回宿主界面请求。 */
  execute(id: string, action: LegendAction): LegendUiRequest | null {
    const entry = this.get(id)
    if (!entry) return null
    if (action === 'close') this.remove(id)
    else if (action === 'toggle-visibility') this.update(id, { hidden: !entry.hidden })
    else if (action === 'move-up' || action === 'move-down')
      this.move(id, action === 'move-up' ? 'up' : 'down')
    else if (entry.kind === 'indicator')
      return {
        action,
        id,
        paneId: entry.paneId,
        definitionId: entry.definitionId,
        role: entry.paneId === MAIN_PANE_ID ? 'main' : 'sub',
      }
    return null
  }

  /** 为所有可见 Pane 生成一份完整图例快照，避免主副图分别发布。 */
  projectFrame(contexts: ReadonlyArray<RenderContext>): void {
    if (this.disposed) return
    const template = this.projectMainTemplate(contexts)
    const rows = this.withActions(this.collectFrameRows(contexts, template), contexts)
    batch(() => {
      this.contextState.set(
        template ? { ...template, rows: rows.filter((row) => row.paneId === MAIN_PANE_ID) } : null,
      )
      this.rowsState.set(rows)
    })
  }

  /** 主图模板：可见指标过滤后投影左上角上下文。 */
  private projectMainTemplate(
    contexts: ReadonlyArray<RenderContext>,
  ): LegendTemplateContext | null {
    const main = contexts.find((context) => context.pane.id === MAIN_PANE_ID)
    if (!main) return null
    const options = this.deps.getOptions()
    const configured = options.legend?.visibleIndicatorIds
    const viewIds = this.deps.getVisibleIndicatorIds()
    const visible = configured ? configured.filter((id) => viewIds.includes(id)) : viewIds
    return projectLegendContext({
      context: main,
      host: this.deps.host,
      yPaddingPx: options.yPaddingPx,
      visibleIndicatorIds: new Set(visible),
    })
  }

  /** 汇总所有 Pane 的展示行：主图模板、副图指标标题与自定义行。 */
  private collectFrameRows(
    contexts: ReadonlyArray<RenderContext>,
    template: LegendTemplateContext | null,
  ): LegendRow[] {
    const rows: LegendRow[] = []
    for (const context of contexts) {
      const paneId = context.pane.id
      if (paneId === MAIN_PANE_ID) {
        if (template) rows.push(...projectMainLegendRows(template, context.pane.top))
      } else rows.push(...this.collectSubPaneRows(context))
      const anchor = rows.filter((row) => row.paneId === paneId).at(-1)
      rows.push(...this.projectCustomRows(context, anchor))
    }
    return rows
  }

  /** 副图指标标题行：从统一实例目录读取当前 Pane 的实例。 */
  private collectSubPaneRows(context: RenderContext): LegendRow[] {
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
    const rows: LegendRow[] = []
    for (const instance of catalog?.listPaneInstances(paneId) ?? []) {
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
        paneId,
        x: PANE_HEADER_INSET_PX,
        y: context.pane.top + 12,
        maxWidth: Math.max(0, context.paneWidth - PANE_HEADER_INSET_PX),
        height: 18,
        gap: 8,
        indicator: { instanceId: instance.instanceId, definitionId: instance.definitionId },
        hidden: title.hidden,
        loading: title.loading,
        texts: projectIndicatorTexts(title, {
          textPrimary: colors.text.primary,
          textTertiary: colors.text.tertiary,
          up: colors.candleUpBody,
          down: colors.candleDownBody,
        }),
        actions: [],
      })
    }
    return rows
  }

  /** 自定义行依次追加在所属 Pane 已有行之后。 */
  private projectCustomRows(context: RenderContext, anchor: LegendRow | undefined): LegendRow[] {
    const paneId = context.pane.id
    const custom = this.customState
      .peek()
      .filter((entry) => entry.paneId === paneId && !entry.hidden)
    let y = anchor ? anchor.y + anchor.height : context.pane.top + 12
    const rows: LegendRow[] = []
    for (const entry of custom) {
      rows.push({
        key: entry.id,
        paneId,
        x: PANE_HEADER_INSET_PX,
        y,
        maxWidth: Math.max(0, context.paneWidth - PANE_HEADER_INSET_PX),
        height: 24,
        gap: 10,
        texts: entry.texts,
        actions: [],
      })
      y += 24
    }
    return rows
  }

  /** 为每条展示行补全 Core 端按钮能力。 */
  private withActions(
    rows: ReadonlyArray<LegendRow>,
    contexts: ReadonlyArray<RenderContext>,
  ): LegendRow[] {
    const entriesById = new Map(this.list().map((entry) => [entry.id, entry]))
    const entries = rows.flatMap((row) => {
      const entry = entriesById.get(row.key)
      return entry ? [entry] : []
    })
    const paneOrder = contexts.map((context) => context.pane.id)
    return rows.map((row) => {
      const entry = entriesById.get(row.key)
      return { ...row, actions: entry ? projectLegendActions(entry, entries, paneOrder) : [] }
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
      this.clearFrame()
    })
  }
}
