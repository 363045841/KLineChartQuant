// 布局管理领域入口：具名文档与自动保存偏好统一存入 IndexedDB，列表按文档创建顺序稳定输出。
import { Type } from 'typebox'
import { Value } from 'typebox/value'
import { createIndexedDbPersistence } from '../../../foundation/persistence/index.js'
import { createSignal } from '../../../foundation/reactivity/signal.js'
import {
  LAYOUT_DOCUMENT_VERSION,
  type LayoutApi,
  type LayoutArchive,
  type LayoutDocument,
  type LayoutSummary,
  type NamedLayoutDocument,
} from '../types.js'

export const DEFAULT_LAYOUT_ID = 'default'
const Workspace = Type.Object({
  instances: Type.Array(
    Type.Object({
      indicatorId: Type.String(),
      paneId: Type.String(),
      role: Type.Union([Type.Literal('main'), Type.Literal('sub')]),
      params: Type.Record(Type.String(), Type.Unknown()),
      instanceId: Type.Optional(Type.String()),
      ordinal: Type.Optional(Type.Number()),
      hidden: Type.Optional(Type.Boolean()),
      source: Type.Optional(Type.Union([Type.Literal('user'), Type.Literal('mode')])),
    }),
  ),
  paneRatios: Type.Record(Type.String(), Type.Number()),
  paneSpecs: Type.Array(Type.Object({ id: Type.String(), ratio: Type.Number() })),
  paneScaleTypes: Type.Record(
    Type.String(),
    Type.Union([Type.Literal('linear'), Type.Literal('log'), Type.Literal('percent')]),
  ),
})
const DocumentSchema = Type.Object({
  version: Type.Literal(LAYOUT_DOCUMENT_VERSION),
  currentSymbol: Type.Optional(
    Type.Union([
      Type.Null(),
      Type.Object({
        symbol: Type.String(),
        market: Type.String(),
        id: Type.Optional(Type.String()),
        exchange: Type.Optional(Type.String()),
        period: Type.Optional(Type.String()),
        adjust: Type.Optional(Type.String()),
        source: Type.Optional(Type.String()),
        params: Type.Optional(
          Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean()])),
        ),
        startDate: Type.Optional(Type.String()),
        endDate: Type.Optional(Type.String()),
        incremental: Type.Optional(Type.Boolean()),
      }),
    ]),
  ),
  workspaces: Type.Object({ kline: Workspace, timeshare: Workspace }),
  panePriceAxisModes: Type.Record(
    Type.String(),
    Type.Union([Type.Literal('auto'), Type.Literal('hand')]),
  ),
  settings: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
})
const DocumentsSchema = Type.Record(
  Type.String(),
  Type.Intersect([DocumentSchema, Type.Object({ id: Type.String(), name: Type.String() })]),
)
const ArchiveSchema = Type.Object({
  documents: DocumentsSchema,
  activeId: Type.String(),
  autoSave: Type.Boolean(),
})

/** 校验归档的文档版本与必需切片；不进行类型断言。 */
function isArchive(value: unknown): value is LayoutArchive {
  return Value.Check(ArchiveSchema, value)
}

/** 空名称在存储前拒绝，保持所有调用方的输入规则一致。 */
function requireName(name: string): string {
  const result = name.trim()
  if (!result) throw new Error('布局名称不能为空')
  return result
}

export class LayoutManager implements LayoutApi {
  private readonly persistence = createIndexedDbPersistence<LayoutArchive>({
    databaseName: '@363045841yyt/klinechart-layouts',
    storeName: 'layouts',
    key: 'documents',
    flushOnPageHide: false,
    codec: { decode: (value) => (isArchive(value) ? value : null), encode: (value) => value },
  })
  private archive: LayoutArchive = {
    documents: {},
    activeId: DEFAULT_LAYOUT_ID,
    autoSave: true,
  }
  private readonly layoutSignal = createSignal<ReadonlyArray<LayoutSummary>>([])
  private readonly activeSignal = createSignal(DEFAULT_LAYOUT_ID)
  private readonly autoSaveSignal = createSignal(true)
  private readonly dirtySignal = createSignal(false)
  private readonly errorSignal = createSignal<string | null>(null)
  private timer: ReturnType<typeof setTimeout> | undefined
  private applying = false
  private disposed = false
  private lastConfiguration = ''
  private loaded = false
  private queue: Promise<unknown> = Promise.resolve()
  readonly layouts = this.layoutSignal
  readonly activeLayoutId = this.activeSignal
  readonly layoutAutoSave = this.autoSaveSignal
  readonly layoutDirty = this.dirtySignal
  readonly layoutSaveError = this.errorSignal

  /** 注入快照与原子恢复能力，管理器不持有另一份运行时状态。 */
  constructor(
    private readonly dependencies: {
      exportLayout(): LayoutDocument
      applyLayout(document: LayoutDocument): void
      createLayout(): LayoutDocument
    },
  ) {
    globalThis.addEventListener?.('pagehide', this.onPageHide)
  }

  /** 页面离开时补写最新配置，失败保留错误状态。 */
  private readonly onPageHide = (): void => {
    if (!this.loaded || !this.archive.autoSave || this.disposed) return
    void this.run(() => this.saveActive()).catch((error: unknown) => {
      this.errorSignal.set(error instanceof Error ? error.message : '自动保存失败')
    })
  }

  /** 返回当前图表的文档快照。 */
  exportLayout(): LayoutDocument {
    return this.dependencies.exportLayout()
  }

  /** 将文档交给图表领域入口恢复。 */
  applyLayout(document: LayoutDocument): void {
    if (!Value.Check(DocumentSchema, document)) throw new Error('布局文档无效或版本不受支持')
    this.applying = true
    try {
      this.dependencies.applyLayout(structuredClone(document))
    } finally {
      this.applying = false
    }
  }

  /** 串行处理归档操作，失败不会阻塞后续操作。 */
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => {
      if (this.disposed) throw new Error('图表已销毁')
      return operation()
    })
    this.queue = result.catch(() => undefined)
    return result
  }

  /** 首次加载归档，默认布局取本图表首次使用管理器时的快照。 */
  private async load(): Promise<void> {
    if (this.loaded) return
    if (typeof indexedDB === 'undefined') throw new Error('浏览器无法使用布局存储')
    const stored = await this.persistence.load()
    this.archive = stored ?? this.archive
    if (!this.archive.documents[DEFAULT_LAYOUT_ID]) {
      await this.commit(
        {
          ...this.archive.documents,
          [DEFAULT_LAYOUT_ID]: { ...this.exportLayout(), id: DEFAULT_LAYOUT_ID, name: '默认布局' },
        },
        DEFAULT_LAYOUT_ID,
      )
    } else if (stored) {
      const active =
        this.archive.documents[this.archive.activeId] ?? this.archive.documents[DEFAULT_LAYOUT_ID]
      this.applyLayout(active)
      this.archive = { ...this.archive, activeId: active.id }
    }
    this.loaded = true
    this.lastConfiguration = JSON.stringify(this.exportLayout())
    this.dirtySignal.set(false)
    this.publish()
  }

  /** 挂载时恢复上次使用的归档，失败通过只读错误信号展示。 */
  initialize(): Promise<void> {
    return this.run(() => this.load()).catch((error: unknown) => {
      this.errorSignal.set(error instanceof Error ? error.message : '布局读取失败')
    })
  }

  /** 只派生归档摘要，按文档创建顺序稳定输出，切换活动文档不改变列表位置。 */
  private publish(): void {
    this.layoutSignal.set(
      Object.keys(this.archive.documents).flatMap((id) => {
        const document = this.archive.documents[id]
        return document ? [Object.freeze({ id, name: document.name })] : []
      }),
    )
    this.activeSignal.set(this.archive.activeId)
    this.autoSaveSignal.set(this.archive.autoSave)
  }

  /** 成功落盘后再发布状态，存储失败不显示虚假的成功结果。 */
  private async commit(
    documents: Readonly<Record<string, NamedLayoutDocument>>,
    activeId = this.archive.activeId,
  ): Promise<void> {
    const archive = { ...this.archive, documents, activeId }
    await this.persistence.save(archive)
    this.archive = archive
    this.errorSignal.set(null)
    this.publish()
  }

  /** 标记真实配置变化；恢复产生的通知不触发回写。 */
  scheduleAutoSave(): void {
    if (this.applying || this.disposed) return
    const configuration = JSON.stringify(this.exportLayout())
    if (configuration === this.lastConfiguration) return
    this.lastConfiguration = configuration
    this.dirtySignal.set(true)
    if (!this.loaded || !this.archive.autoSave) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.run(() => this.saveActive()).catch((error: unknown) => {
        this.errorSignal.set(error instanceof Error ? error.message : '自动保存失败')
      })
    }, 600)
  }

  /** 切换前和销毁前补写，避免防抖期间的最后一次修改丢失。 */
  private async saveActive(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    if (!this.dirtySignal.peek()) return
    const current = this.requireDocument(this.archive.activeId)
    const snapshot = this.exportLayout()
    await this.commit({
      ...this.archive.documents,
      [current.id]: { ...snapshot, id: current.id, name: current.name },
    })
    // 保存过程中若发生新变更，保留脏标记并安排下一次保存。
    if (JSON.stringify(snapshot) === JSON.stringify(this.exportLayout()))
      this.dirtySignal.set(false)
    else this.scheduleAutoSave()
  }

  /** 释放计时器并补写已开启的自动保存。 */
  async dispose(): Promise<void> {
    clearTimeout(this.timer)
    globalThis.removeEventListener?.('pagehide', this.onPageHide)
    try {
      await this.run(async () => {
        if (this.loaded && this.archive.autoSave) await this.saveActive()
      })
    } finally {
      this.disposed = true
      await this.persistence.dispose()
    }
  }

  /** 查询具名布局，同时初始化默认归档。 */
  listLayouts(): Promise<ReadonlyArray<LayoutSummary>> {
    return this.run(async () => {
      await this.load()
      return this.layouts.peek()
    })
  }

  /** 保存当前图表；有 id 时覆盖指定归档。 */
  saveLayout(input: { name: string; id?: string }): Promise<string> {
    return this.run(async () => {
      await this.load()
      const id = input.id ?? crypto.randomUUID()
      if (input.id && !this.archive.documents[id]) throw new Error('布局不存在')
      await this.commit(
        {
          ...this.archive.documents,
          [id]: { ...this.exportLayout(), id, name: requireName(input.name) },
        },
        id,
      )
      this.dirtySignal.set(
        JSON.stringify(this.archive.documents[id]) !==
          JSON.stringify({ ...this.exportLayout(), id, name: requireName(input.name) }),
      )
      if (this.dirtySignal.peek()) this.scheduleAutoSave()
      return id
    })
  }

  /** 切换到已保存的图表配置；恢复失败时保留当前身份。 */
  switchLayout(input: { id: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      if (this.archive.autoSave) await this.saveActive()
      clearTimeout(this.timer)
      const previous = this.exportLayout()
      try {
        this.applyLayout(this.requireDocument(input.id))
        await this.commit(this.archive.documents, input.id)
      } catch (error) {
        this.applyLayout(previous)
        throw error
      }
      this.lastConfiguration = JSON.stringify(this.exportLayout())
      this.dirtySignal.set(false)
    })
  }

  /** 修改归档名称。 */
  renameLayout(input: { id: string; name: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      await this.commit({
        ...this.archive.documents,
        [input.id]: { ...this.requireDocument(input.id), name: requireName(input.name) },
      })
    })
  }

  /** 复制已保存的文档，不改变当前图表。 */
  duplicateLayout(input: { id: string; name: string }): Promise<string> {
    return this.run(async () => {
      await this.load()
      const id = crypto.randomUUID()
      await this.commit({
        ...this.archive.documents,
        [id]: {
          ...(input.id === this.archive.activeId
            ? this.exportLayout()
            : this.requireDocument(input.id)),
          id,
          name: requireName(input.name),
        },
      })
      return id
    })
  }

  /** 默认与当前正在使用的归档不能删除。 */
  deleteLayout(input: { id: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      this.requireDocument(input.id)
      if (input.id === DEFAULT_LAYOUT_ID || input.id === this.activeLayoutId.peek())
        throw new Error('默认布局和当前布局不能删除')
      const next = { ...this.archive.documents }
      delete next[input.id]
      await this.commit(next)
    })
  }

  /** 找不到身份时明确失败，避免误操作默认文档。 */
  private requireDocument(id: string): NamedLayoutDocument {
    const document = this.archive.documents[id]
    if (!document) throw new Error('布局不存在')
    return document
  }

  /** 创建无用户指标的全新布局，并切换到它。 */
  createLayout(input: { name: string }): Promise<string> {
    return this.run(async () => {
      await this.load()
      if (this.archive.autoSave) await this.saveActive()
      const id = crypto.randomUUID()
      const document = { ...this.dependencies.createLayout(), id, name: requireName(input.name) }
      await this.commit({ ...this.archive.documents, [id]: document }, id)
      this.applyLayout(document)
      this.lastConfiguration = JSON.stringify(this.exportLayout())
      this.dirtySignal.set(false)
      return id
    })
  }

  /** 自动保存偏好与归档在同一存储事务里更新。 */
  setLayoutAutoSave(input: { enabled: boolean }): Promise<void> {
    return this.run(async () => {
      await this.load()
      clearTimeout(this.timer)
      const archive = { ...this.archive, autoSave: input.enabled }
      await this.persistence.save(archive)
      this.archive = archive
      this.publish()
      if (input.enabled) await this.saveActive()
    })
  }
}
