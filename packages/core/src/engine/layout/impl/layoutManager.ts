// 布局管理领域入口：具名文档与自动保存偏好统一存入 IndexedDB，列表按文档创建顺序稳定输出。
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
const DEFAULT_LAYOUT_NAME = '默认布局'
const AUTO_SAVE_DEBOUNCE_MS = 600
/** 高频来源（视口滚动、缩放）静止多久后再比较配置。 */
const COALESCED_CHECK_IDLE_MS = 250

/** 判断值是否为普通对象（排除 null 与数组）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 具名文档的最小结构校验：版本、身份与两个必需切片齐备；深入字段由各 state 恢复入口负责。 */
function isNamedLayoutDocument(value: unknown): value is NamedLayoutDocument {
  return (
    isRecord(value) &&
    value.version === LAYOUT_DOCUMENT_VERSION &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isRecord(value.workspaces) &&
    isRecord(value.panePriceAxisModes)
  )
}

/** 归档存储校验：只保留结构完整的文档，避免脏数据进入内存状态。 */
function decodeArchive(value: unknown): LayoutArchive | null {
  if (
    !isRecord(value) ||
    typeof value.activeId !== 'string' ||
    typeof value.autoSave !== 'boolean' ||
    !isRecord(value.documents)
  )
    return null
  const documents: Record<string, NamedLayoutDocument> = {}
  for (const [id, document] of Object.entries(value.documents)) {
    if (isNamedLayoutDocument(document)) documents[id] = document
  }
  return { documents, activeId: value.activeId, autoSave: value.autoSave }
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
    codec: { decode: decodeArchive, encode: (value) => value },
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
  private coalescedTimer: ReturnType<typeof setTimeout> | undefined
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
      /** 恢复前准备文档依赖（如按需加载其指标实现）；完成后再原子写入状态。 */
      prepareLayout?(document: LayoutDocument): Promise<void>
    },
  ) {
    globalThis.addEventListener?.('pagehide', this.onPageHide)
  }

  // ── 状态判定 ──

  /** 是否应把当前配置写回活动布局：已加载、开启自动保存且未销毁。 */
  private shouldAutoSave(): boolean {
    return this.loaded && this.archive.autoSave && !this.disposed
  }

  /** 当前配置的稳定字符串，用于判断是否发生真实变更。 */
  private currentConfiguration(): string {
    return JSON.stringify(this.exportLayout())
  }

  /** 把当前配置记为干净基线；恢复与保存成功后都走这里。 */
  private markClean(): void {
    this.lastConfiguration = this.currentConfiguration()
    this.dirtySignal.set(false)
  }

  /** 把未知错误转成界面文案写入错误信号。 */
  private reportError(error: unknown, fallback: string): void {
    this.errorSignal.set(error instanceof Error ? error.message : fallback)
  }

  // ── 归档读写 ──

  /** 成功落盘后再发布状态，存储失败不显示虚假的成功结果。 */
  private async saveArchive(archive: LayoutArchive): Promise<void> {
    await this.persistence.save(archive)
    this.archive = archive
    this.errorSignal.set(null)
    this.publish()
  }

  /** 覆盖文档集（默认沿用当前活动身份）。 */
  private saveDocuments(
    documents: Readonly<Record<string, NamedLayoutDocument>>,
    activeId = this.archive.activeId,
  ): Promise<void> {
    return this.saveArchive({ ...this.archive, documents, activeId })
  }

  /** 只派生归档摘要，按文档创建顺序稳定输出；切换活动文档不改变列表位置。 */
  private publish(): void {
    this.layoutSignal.set(
      Object.entries(this.archive.documents).map(([id, document]) =>
        Object.freeze({
          id,
          name: document.name,
          deletable: id !== DEFAULT_LAYOUT_ID && id !== this.archive.activeId,
        }),
      ),
    )
    this.activeSignal.set(this.archive.activeId)
    this.autoSaveSignal.set(this.archive.autoSave)
  }

  /** 找不到身份时明确失败，避免误操作默认文档。 */
  private requireDocument(id: string): NamedLayoutDocument {
    const document = this.archive.documents[id]
    if (!document) throw new Error('布局不存在')
    return document
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

  // ── 生命周期 ──

  /** 页面离开时补写最新配置。 */
  private readonly onPageHide = (): void => {
    this.flushCoalescedAutoSave()
    if (!this.shouldAutoSave()) return
    void this.run(() => this.saveActive()).catch((error: unknown) =>
      this.reportError(error, '自动保存失败'),
    )
  }

  /** 释放计时器并补写已开启的自动保存。 */
  async dispose(): Promise<void> {
    this.flushCoalescedAutoSave()
    clearTimeout(this.timer)
    globalThis.removeEventListener?.('pagehide', this.onPageHide)
    try {
      await this.run(async () => {
        if (this.shouldAutoSave()) await this.saveActive()
      })
    } finally {
      this.disposed = true
      await this.persistence.dispose()
    }
  }

  // ── 领域操作 ──

  /** 返回当前图表的文档快照。 */
  exportLayout(): LayoutDocument {
    return this.dependencies.exportLayout()
  }

  /** 将文档交给图表领域入口恢复；文档由本管理器或调用方按契约构造。 */
  async applyLayout(document: LayoutDocument): Promise<void> {
    await this.prepare(document)
    this.applyPrepared(document)
  }

  /** 等待文档依赖就绪，使恢复后的首帧即为完整状态。 */
  private async prepare(document: LayoutDocument): Promise<void> {
    await this.dependencies.prepareLayout?.(document)
  }

  /** 同步写入已准备好的文档；恢复期间的状态通知不触发自动保存。 */
  private applyPrepared(document: LayoutDocument): void {
    this.applying = true
    try {
      this.dependencies.applyLayout(structuredClone(document))
    } finally {
      this.applying = false
    }
  }

  /** 首次加载归档，默认布局取本图表首次使用管理器时的快照。 */
  private async load(): Promise<void> {
    if (this.loaded) return
    if (typeof indexedDB === 'undefined') throw new Error('浏览器无法使用布局存储')
    const stored = await this.persistence.load()
    if (stored) this.archive = stored
    const fallback = this.archive.documents[DEFAULT_LAYOUT_ID]
    if (!fallback) {
      await this.saveDocuments(
        {
          ...this.archive.documents,
          [DEFAULT_LAYOUT_ID]: {
            ...this.exportLayout(),
            id: DEFAULT_LAYOUT_ID,
            name: DEFAULT_LAYOUT_NAME,
          },
        },
        DEFAULT_LAYOUT_ID,
      )
    } else if (stored) {
      const active = this.archive.documents[this.archive.activeId] ?? fallback
      await this.prepare(active)
      this.applyPrepared(active)
      this.archive = { ...this.archive, activeId: active.id }
    }
    this.loaded = true
    this.markClean()
    this.publish()
  }

  /** 挂载时恢复上次使用的归档，失败通过只读错误信号展示。 */
  initialize(): Promise<void> {
    return this.run(() => this.load()).catch((error: unknown) =>
      this.reportError(error, '布局读取失败'),
    )
  }

  /** 标记真实配置变化；恢复产生的通知不触发回写。 */
  scheduleAutoSave(): void {
    if (this.applying || this.disposed) return
    const configuration = this.currentConfiguration()
    if (configuration === this.lastConfiguration) return
    this.lastConfiguration = configuration
    this.dirtySignal.set(true)
    if (!this.shouldAutoSave()) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.run(() => this.saveActive()).catch((error: unknown) =>
        this.reportError(error, '自动保存失败'),
      )
    }, AUTO_SAVE_DEBOUNCE_MS)
  }

  /**
   * 高频来源（视口逐帧滚动、缩放）只登记待检查，静止后比较一次配置；
   * 否则每帧都要导出并序列化整份布局。离开页面、销毁与补写前会先完成待检查。
   */
  scheduleCoalescedAutoSave(): void {
    if (this.applying || this.disposed) return
    clearTimeout(this.coalescedTimer)
    this.coalescedTimer = setTimeout(() => {
      this.coalescedTimer = undefined
      this.scheduleAutoSave()
    }, COALESCED_CHECK_IDLE_MS)
  }

  /** 立即执行尚未到期的合并检查。 */
  private flushCoalescedAutoSave(): void {
    if (this.coalescedTimer === undefined) return
    clearTimeout(this.coalescedTimer)
    this.coalescedTimer = undefined
    this.scheduleAutoSave()
  }

  /** 切换前和销毁前补写，避免防抖期间的最后一次修改丢失。 */
  private async saveActive(): Promise<void> {
    this.flushCoalescedAutoSave()
    clearTimeout(this.timer)
    this.timer = undefined
    if (!this.dirtySignal.peek()) return
    const current = this.requireDocument(this.archive.activeId)
    const snapshot = this.exportLayout()
    await this.saveDocuments({
      ...this.archive.documents,
      [current.id]: { ...snapshot, id: current.id, name: current.name },
    })
    // 保存过程中若发生新变更，保留脏标记并安排下一次保存。
    if (this.currentConfiguration() === JSON.stringify(snapshot)) this.dirtySignal.set(false)
    else this.scheduleAutoSave()
  }

  /** 查询具名布局，同时初始化默认归档。 */
  listLayouts(): Promise<ReadonlyArray<LayoutSummary>> {
    return this.run(async () => {
      await this.load()
      return this.layouts.peek()
    })
  }

  /** 保存当前图表；有 id 时覆盖指定归档。保存后当前状态即是归档内容。 */
  saveLayout(input: { name: string; id?: string }): Promise<string> {
    return this.run(async () => {
      await this.load()
      const id = input.id ?? crypto.randomUUID()
      if (input.id) this.requireDocument(input.id)
      await this.saveDocuments(
        {
          ...this.archive.documents,
          [id]: { ...this.exportLayout(), id, name: requireName(input.name) },
        },
        id,
      )
      this.markClean()
      return id
    })
  }

  /** 切换到已保存的图表配置；恢复失败时保留当前身份。 */
  switchLayout(input: { id: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      if (this.shouldAutoSave()) await this.saveActive()
      clearTimeout(this.timer)
      const previous = this.exportLayout()
      const next = this.requireDocument(input.id)
      await this.prepare(next)
      try {
        this.applyPrepared(next)
        await this.saveDocuments(this.archive.documents, input.id)
      } catch (error) {
        // 回滚目标是当前状态，其依赖已就绪。
        this.applyPrepared(previous)
        throw error
      }
      this.markClean()
    })
  }

  /** 修改归档名称。 */
  renameLayout(input: { id: string; name: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      await this.saveDocuments({
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
      await this.saveDocuments({
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
      if (input.id === DEFAULT_LAYOUT_ID || input.id === this.archive.activeId)
        throw new Error('默认布局和当前布局不能删除')
      const next = { ...this.archive.documents }
      delete next[input.id]
      await this.saveDocuments(next)
    })
  }

  /** 创建无用户指标的全新布局，并切换到它。 */
  createLayout(input: { name: string }): Promise<string> {
    return this.run(async () => {
      await this.load()
      if (this.shouldAutoSave()) await this.saveActive()
      const id = crypto.randomUUID()
      const document = { ...this.dependencies.createLayout(), id, name: requireName(input.name) }
      await this.prepare(document)
      await this.saveDocuments({ ...this.archive.documents, [id]: document }, id)
      this.applyPrepared(document)
      this.markClean()
      return id
    })
  }

  /** 自动保存偏好与归档在同一存储事务里更新。 */
  setLayoutAutoSave(input: { enabled: boolean }): Promise<void> {
    return this.run(async () => {
      await this.load()
      clearTimeout(this.timer)
      await this.saveArchive({ ...this.archive, autoSave: input.enabled })
      if (this.shouldAutoSave()) await this.saveActive()
    })
  }
}
