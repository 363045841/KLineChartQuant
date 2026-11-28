/**
 * 指标模板管理：把具名指标组合统一存成一份归档，列表按写入顺序稳定输出。
 *
 * @remarks
 * 与布局管理共用同一套归档语义：模板只描述「有哪些指标」及其参数，不记录图表上
 * 是什么样；合并、排序与恢复都在模板层完成，避免用户预期被底层顺序打乱。
 * 所有写入串行执行，并发不会互相覆盖；保存失败不阻塞图表的其他写入。
 */

import {
  createIndexedDbDocumentStore,
  type DocumentStore,
} from '../../../foundation/persistence/index.js'
import {
  asReadonlySignal,
  batch,
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
import { indicatorTemplateDatabase } from './indicatorTemplateDatabase.js'
import { collectTemplateIndicatorIds, selectTemplateIndicators } from './templateExtract.js'
import {
  countWorkspaceInstances,
  findMissingIndicators,
  summarizeIndicators,
  summarizeTemplateIndicators,
} from './templateSummary.js'

/** 最近使用列表的容量上限。 */
const RECENT_LIMIT = 10

/** 判断值是否为普通对象（排除 null 与数组）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 模板文档的最小结构校验；其余字段由恢复入口补齐。 */
function isNamedTemplate(value: unknown): value is NamedIndicatorTemplate {
  return (
    isRecord(value) &&
    value.version === INDICATOR_TEMPLATE_VERSION &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isRecord(value.workspaces)
  )
}

/** 归档存储校验：只接受结构完整的模板，避免指标被删除时留下失效记录。 */
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

/** 模板名在存储前拒绝空白；与界面的校验文案保持一致。 */
function requireName(name: string): string {
  const result = name.trim()
  if (!result) throw new Error('模板名称不能为空')
  return result
}

export class IndicatorTemplateManager implements IndicatorTemplateApi {
  private readonly archiveStore: DocumentStore<IndicatorTemplateArchive> =
    createIndexedDbDocumentStore<IndicatorTemplateArchive>({
      database: indicatorTemplateDatabase,
      key: 'archive',
      codec: { decode: decodeArchive, encode: (value) => value },
    })
  private archive: IndicatorTemplateArchive = { documents: {}, recentIds: [] }
  private queue: Promise<unknown> = Promise.resolve()
  private readonly listSignal = createSignal<ReadonlyArray<IndicatorTemplateSummary>>([])
  private readonly recentSignal = createSignal<ReadonlyArray<string>>([])
  private loaded = false
  readonly templates = asReadonlySignal(this.listSignal)
  readonly recentTemplateIds = asReadonlySignal(this.recentSignal)
  readonly currentIndicators: ReadonlySignal<ReadonlyArray<IndicatorTemplateIndicator>>

  /**
   * 注册图表读取与写入端口，构造第二层运行时状态。
   *
   * @param dependencies.extractIndicators 从当前图表提取模板需要的指标组合。
   * @param dependencies.applyIndicators 把指标组合恢复到当前图表。
   * @param dependencies.userIndicatorConfigurations 当前各工作区的用户指标，用于摘要与排序。
   * @param dependencies.loadIndicators 恢复前加载指标实现，不改变指标定义。
   */
  constructor(
    private readonly dependencies: {
      extractIndicators(): TemplateWorkspaces
      applyIndicators(workspaces: TemplateWorkspaces): void
      userIndicatorConfigurations: ReadonlySignal<
        Readonly<Record<ChartWorkspaceId, ReadonlyArray<IndicatorInstanceConfig>>>
      >
      loadIndicators?(indicatorIds: ReadonlyArray<string>): Promise<void>
      definitions: import('../../indicators/registry/index.js').DefinitionRegistry
    },
  ) {
    // 摘要与模板列表共享同一份定义投影，只依赖注册表与当前指标状态。
    this.currentIndicators = computed(() =>
      summarizeIndicators(
        dependencies.definitions,
        Object.values(dependencies.userIndicatorConfigurations()).flat(),
      ),
    )
  }

  // ── 归档读写 ──

  /** 在单个事务内基于内存快照更新归档，应用变更后再把结果发布回内存。 */
  private async updateArchive(
    change: (current: IndicatorTemplateArchive) => IndicatorTemplateArchive,
  ): Promise<IndicatorTemplateArchive> {
    const next = await this.archiveStore.update((current) =>
      change(current ?? { documents: {}, recentIds: [] }),
    )
    this.archive = next
    this.publish()
    return next
  }

  /** 只发布摘要与文档写入顺序；重命名同名模板不改变列表位置。 */
  private publish(): void {
    const { documents, recentIds } = this.archive
    const templates = Object.freeze(
      Object.entries(documents).map(([id, document]) =>
        Object.freeze({
          id,
          name: document.name,
          labels: Object.freeze(
            summarizeTemplateIndicators(this.dependencies.definitions, document.workspaces),
          ),
          instanceCount: countWorkspaceInstances(document.workspaces),
        }),
      ),
    )
    batch(() => {
      this.listSignal.set(templates)
      this.recentSignal.set(Object.freeze([...recentIds]))
    })
  }

  /** 找不到模板时明确失败，避免静默创建空模板。 */
  private requireTemplate(id: string): NamedIndicatorTemplate {
    const document = this.archive.documents[id]
    if (!document) throw new Error('模板不存在')
    return document
  }

  /** 串行化归档操作；单次失败不阻断后续操作。 */
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  /** 首次读取归档；不可用时明确失败，由界面转成可读的文案。 */
  private async load(): Promise<void> {
    if (this.loaded) return
    const stored = await this.archiveStore.read()
    if (stored) this.archive = stored
    this.loaded = true
    this.publish()
  }

  // ── 生命周期 ──

  /** 启动时读取归档；失败不把图表指标列表清空。 */
  initialize(): Promise<void> {
    return this.run(() => this.load())
  }

  /** 释放存储资源；模板按显式保存语义，不做退出时的补写。 */
  async dispose(): Promise<void> {
    await this.archiveStore.dispose()
  }

  // ── 模板操作 ──

  /** 查询模板列表，同时初始化归档。 */
  listTemplates(): Promise<ReadonlyArray<IndicatorTemplateSummary>> {
    return this.run(async () => {
      await this.load()
      return this.templates.peek()
    })
  }

  /** 保存当前指标组合；同名模板按名称覆盖，不产生重复项。 */
  saveTemplate(input: { name: string; indicatorIds?: ReadonlyArray<string> }): Promise<string> {
    return this.run(async () => {
      await this.load()
      const name = requireName(input.name)
      const workspaces = selectTemplateIndicators(
        this.dependencies.extractIndicators(),
        input.indicatorIds,
      )
      let id = ''
      await this.updateArchive((current) => {
        const existing = Object.values(current.documents).find((document) => document.name === name)
        id = existing?.id ?? crypto.randomUUID()
        return {
          ...current,
          documents: {
            ...current.documents,
            [id]: { version: INDICATOR_TEMPLATE_VERSION, workspaces, id, name },
          },
        }
      })
      return id
    })
  }

  /** 修改模板名称；与其他模板重名时拒绝，保持列表名称唯一。 */
  renameTemplate(input: { id: string; name: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      const name = requireName(input.name)
      await this.updateArchive((current) => {
        const target = current.documents[input.id]
        if (!target) throw new Error('模板不存在')
        const conflict = Object.values(current.documents).find(
          (document) => document.name === name && document.id !== target.id,
        )
        if (conflict) throw new Error('已存在同名模板')
        return {
          ...current,
          documents: { ...current.documents, [target.id]: { ...target, name } },
        }
      })
    })
  }

  /** 删除模板，同时从「最近使用」列表中移除。 */
  deleteTemplate(input: { id: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      await this.updateArchive((current) => {
        if (!current.documents[input.id]) throw new Error('模板不存在')
        const documents = { ...current.documents }
        delete documents[input.id]
        return {
          documents,
          recentIds: current.recentIds.filter((id) => id !== input.id),
        }
      })
    })
  }

  /** 应用模板：先加载实现，再替换当前图表上的用户指标。 */
  applyTemplate(input: { id: string }): Promise<IndicatorTemplateApplyResult> {
    return this.run(async () => {
      await this.load()
      const template = this.requireTemplate(input.id)
      const indicatorIds = collectTemplateIndicatorIds(template.workspaces)
      // 先加载实现再判断缺失；脚本指标注册完成即可恢复，失败则跳过并报告。
      await this.dependencies.loadIndicators?.(indicatorIds)
      const skipped = findMissingIndicators(this.dependencies.definitions, template.workspaces)
      this.dependencies.applyIndicators(template.workspaces)
      await this.updateArchive((current) => {
        const recentIds = [template.id, ...current.recentIds.filter((id) => id !== template.id)]
        return { ...current, recentIds: recentIds.slice(0, RECENT_LIMIT) }
      })
      return Object.freeze({
        applied: countWorkspaceInstances(template.workspaces),
        skipped,
      })
    })
  }
}
