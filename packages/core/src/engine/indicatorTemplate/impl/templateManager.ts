/**
 * 指标模板管理：具名指标组合统一存入 IndexedDB，列表按写入顺序稳定输出。
 *
 * @remarks
 * 与布局管理器刻意分开存储：模板描述「用了哪些指标」，布局描述「整张图表长什么样」。
 * 合并会让切换布局带走模板，与用户预期不符。
 * 所有写操作串行执行，避免并发保存互相覆盖；读失败不阻断图表，写失败才上报。
 */

import { createArchivePersistence } from '../../../foundation/persistence/index.js'
import {
  computed,
  createSignal,
  type ReadonlySignal,
} from '../../../foundation/reactivity/signal.js'
import type { ChartWorkspaceId } from '../../../foundation/types/chartView.js'
import type { IndicatorInstanceConfig } from '../../state/indicatorState.js'
import {
  INDICATOR_TEMPLATE_VERSION,
  type IndicatorTemplateApi,
  type IndicatorTemplateApplyResult,
  type IndicatorTemplateArchive,
  type IndicatorTemplateIndicator,
  type IndicatorTemplateSummary,
  type NamedIndicatorTemplate,
  type TemplateWorkspaces,
} from '../types.js'
import { collectTemplateIndicatorIds, selectTemplateIndicators } from './templateExtract.js'
import {
  countWorkspaceInstances,
  findMissingIndicators,
  summarizeIndicators,
  summarizeTemplateIndicators,
} from './templateSummary.js'

/** 「最近用过」保留的条数上限。 */
const RECENT_LIMIT = 10

/** 判断值是否为普通对象（排除 null 与数组）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 单个模板文档的最小结构校验；深入字段由恢复入口负责。 */
function isNamedTemplate(value: unknown): value is NamedIndicatorTemplate {
  return (
    isRecord(value) &&
    value.version === INDICATOR_TEMPLATE_VERSION &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isRecord(value.workspaces)
  )
}

/** 归档存储校验：只保留结构完整的模板，并丢弃指向已删除模板的最近记录。 */
function decodeArchive(value: unknown): IndicatorTemplateArchive | null {
  if (!isRecord(value) || !isRecord(value.documents)) return null
  const documents: Record<string, NamedIndicatorTemplate> = {}
  for (const [id, document] of Object.entries(value.documents)) {
    if (isNamedTemplate(document)) documents[id] = document
  }
  const recentIds = Array.isArray(value.recentIds)
    ? value.recentIds.filter((id): id is string => typeof id === 'string' && id in documents)
    : []
  return { documents, recentIds }
}

/** 空名称在存储前拒绝，保持所有调用方的输入规则一致。 */
function requireName(name: string): string {
  const result = name.trim()
  if (!result) throw new Error('模板名称不能为空')
  return result
}

export class IndicatorTemplateManager implements IndicatorTemplateApi {
  private readonly archiveStore = createArchivePersistence<IndicatorTemplateArchive>({
    databaseName: '@363045841yyt/klinechart-indicator-templates',
    databaseVersion: INDICATOR_TEMPLATE_VERSION,
    storeName: 'templates',
    key: 'archive',
    codec: { decode: decodeArchive, encode: (value) => value },
    disposedMessage: '图表已销毁',
  })
  private archive: IndicatorTemplateArchive = { documents: {}, recentIds: [] }
  private readonly listSignal = createSignal<ReadonlyArray<IndicatorTemplateSummary>>([])
  private readonly recentSignal = createSignal<ReadonlyArray<string>>([])
  private loaded = false
  readonly templates = this.listSignal
  readonly recentTemplateIds = this.recentSignal
  readonly currentIndicators: ReadonlySignal<ReadonlyArray<IndicatorTemplateIndicator>>

  /**
   * 注入图表侧能力，管理器不持有第二份运行时状态。
   *
   * @param dependencies.extractIndicators 从当前图表提取模板需要的指标组合。
   * @param dependencies.applyIndicators 把指标组合恢复到当前图表。
   * @param dependencies.userIndicatorConfigurations 当前两个数据视图的用户指标，供摘要派生。
   * @param dependencies.loadIndicators 恢复前加载指标实现；不改变恢复语义。
   */
  constructor(
    private readonly dependencies: {
      extractIndicators(): TemplateWorkspaces
      applyIndicators(workspaces: TemplateWorkspaces): void
      userIndicatorConfigurations: ReadonlySignal<
        Readonly<Record<ChartWorkspaceId, ReadonlyArray<IndicatorInstanceConfig>>>
      >
      loadIndicators?(indicatorIds: ReadonlyArray<string>): Promise<void>
    },
  ) {
    // 摘要与模板列表共用同一套名称汇总规则；这里只做派生，不复制指标状态。
    this.currentIndicators = computed(() =>
      summarizeIndicators(Object.values(dependencies.userIndicatorConfigurations()).flat()),
    )
  }

  // ── 归档读写 ──

  /** 成功落盘后再发布状态，存储失败不显示虚假的成功结果。 */
  private async saveArchive(archive: IndicatorTemplateArchive): Promise<void> {
    await this.archiveStore.save(archive)
    this.archive = archive
    this.publish()
  }

  /** 只派生摘要，按文档写入顺序稳定输出；覆盖同名模板不改变列表位置。 */
  private publish(): void {
    this.listSignal.set(
      Object.entries(this.archive.documents).map(([id, document]) =>
        Object.freeze({
          id,
          name: document.name,
          labels: summarizeTemplateIndicators(document.workspaces),
          instanceCount: countWorkspaceInstances(document.workspaces),
        }),
      ),
    )
    this.recentSignal.set(this.archive.recentIds)
  }

  /** 找不到身份时明确失败，避免静默操作到别的模板。 */
  private requireTemplate(id: string): NamedIndicatorTemplate {
    const document = this.archive.documents[id]
    if (!document) throw new Error('模板不存在')
    return document
  }

  /** 串行处理归档操作，失败不会阻塞后续操作。 */
  private run<T>(operation: () => Promise<T>): Promise<T> {
    return this.archiveStore.run(operation)
  }

  /** 首次读取归档；IndexedDB 不可用时抛错，由控制器转成界面文案。 */
  private async load(): Promise<void> {
    if (this.loaded) return
    if (typeof indexedDB === 'undefined') throw new Error('浏览器无法使用模板存储')
    const stored = await this.archiveStore.loadStored()
    if (stored) this.archive = stored
    this.loaded = true
    this.publish()
  }

  // ── 生命周期 ──

  /** 挂载时读取归档；失败不阻断图表，列表为空。 */
  initialize(): Promise<void> {
    return this.run(() => this.load())
  }

  /** 释放存储资源；模板是显式保存的，销毁时不补写。 */
  async dispose(): Promise<void> {
    await this.archiveStore.dispose()
  }

  // ── 领域操作 ──

  /** 查询模板列表，同时初始化归档。 */
  listTemplates(): Promise<ReadonlyArray<IndicatorTemplateSummary>> {
    return this.run(async () => {
      await this.load()
      return this.templates.peek()
    })
  }

  /** 保存当前指标组合；同名模板按名称覆盖，不新增副本。 */
  saveTemplate(input: { name: string; indicatorIds?: ReadonlyArray<string> }): Promise<string> {
    return this.run(async () => {
      await this.load()
      const name = requireName(input.name)
      const workspaces = selectTemplateIndicators(
        this.dependencies.extractIndicators(),
        input.indicatorIds,
      )
      const existing = Object.values(this.archive.documents).find(
        (document) => document.name === name,
      )
      const id = existing?.id ?? crypto.randomUUID()
      await this.saveArchive({
        ...this.archive,
        documents: {
          ...this.archive.documents,
          [id]: { version: INDICATOR_TEMPLATE_VERSION, workspaces, id, name },
        },
      })
      return id
    })
  }

  /** 修改模板名称；与其它模板重名时拒绝，避免列表出现两条同名。 */
  renameTemplate(input: { id: string; name: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      const name = requireName(input.name)
      const target = this.requireTemplate(input.id)
      const conflict = Object.values(this.archive.documents).find(
        (document) => document.name === name && document.id !== target.id,
      )
      if (conflict) throw new Error('已存在同名模板')
      await this.saveArchive({
        ...this.archive,
        documents: { ...this.archive.documents, [target.id]: { ...target, name } },
      })
    })
  }

  /** 删除模板，同时把它从「最近用过」里移除。 */
  deleteTemplate(input: { id: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      const target = this.requireTemplate(input.id)
      const documents = { ...this.archive.documents }
      delete documents[target.id]
      await this.saveArchive({
        documents,
        recentIds: this.archive.recentIds.filter((id) => id !== target.id),
      })
    })
  }

  /** 应用模板：先加载实现，再替换当前图表上的用户指标。 */
  applyTemplate(input: { id: string }): Promise<IndicatorTemplateApplyResult> {
    return this.run(async () => {
      await this.load()
      const template = this.requireTemplate(input.id)
      const indicatorIds = collectTemplateIndicatorIds(template.workspaces)
      // 先加载实现再判定缺失：脚本指标注册完成后即可恢复，不必等下一次应用。
      await this.dependencies.loadIndicators?.(indicatorIds)
      const skipped = findMissingIndicators(template.workspaces)
      this.dependencies.applyIndicators(template.workspaces)
      const recentIds = [template.id, ...this.archive.recentIds.filter((id) => id !== template.id)]
      await this.saveArchive({ ...this.archive, recentIds: recentIds.slice(0, RECENT_LIMIT) })
      return Object.freeze({
        applied: countWorkspaceInstances(template.workspaces),
        skipped,
      })
    })
  }
}
