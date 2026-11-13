// 布局管理领域入口：具名文档与自动保存偏好统一存入 IndexedDB，列表按文档创建顺序稳定输出。
import { createDocumentStore, type DocumentStore } from '../../../foundation/persistence/index.js'
import { createSignal } from '../../../foundation/reactivity/signal.js'
import {
  LAYOUT_DOCUMENT_VERSION,
  type LayoutApi,
  type LayoutArchive,
  type LayoutDocument,
  type LayoutSummary,
  type NamedLayoutDocument,
} from '../types.js'

const DEFAULT_LAYOUT_ID = 'default'
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
  private readonly archiveStore: DocumentStore<LayoutArchive>
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
  /** 最近一次高频变化的时间；检查触发时据此判断是否已静止。 */
  private coalescedAt = 0
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
      /** 配置发布后加载指标内容；不得阻塞窗格布局恢复。 */
      loadContent?(document: LayoutDocument): Promise<void>
    },
    /**
     * `restore: false` 时归档只作为手动保存/切换的仓库：
     * 读取不会把活动布局应用到图表，供“每个窗口/标签各自持有配置”的宿主使用。
     */
    private readonly options: { restore?: boolean; storageId?: string } = {},
  ) {
    this.archiveStore = createDocumentStore<LayoutArchive>({
      databaseName: '@363045841yyt/klinechart-layouts',
      version: LAYOUT_DOCUMENT_VERSION,
      storeName: 'layouts',
      // 每个持有者独占自己的归档键；读改写由仓库在单个事务内完成。
      key: options.storageId === undefined ? 'documents' : ['documents', options.storageId],
      codec: { decode: decodeArchive, encode: (value) => value },
    })
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

  /**
   * 在单个事务内基于磁盘上的最新归档应用变更，再把结果发布到内存。
   *
   * 读取失败或归档缺失时直接抛错，绝不用内存快照覆盖未知状态。
   */
  private async updateArchive(
    change: (current: LayoutArchive) => LayoutArchive,
  ): Promise<LayoutArchive> {
    const next = await this.archiveStore.update((current) => {
      if (!current) throw new Error('布局归档尚未初始化')
      return change(current)
    })
    this.archive = next
    this.errorSignal.set(null)
    this.publish()
    return next
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
    const result = this.queue.then(operation)
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
      await this.archiveStore.dispose()
    }
  }

  // ── 领域操作 ──

  /** 返回当前图表的文档快照。 */
  exportLayout(): LayoutDocument {
    return this.dependencies.exportLayout()
  }

  /** 将文档交给图表领域入口恢复；文档由本管理器或调用方按契约构造。 */
  async applyLayout(document: LayoutDocument): Promise<void> {
    this.applySnapshot(document)
    await this.dependencies.loadContent?.(document)
  }

  /** 同步恢复完整配置；恢复期间的状态通知不触发自动保存。 */
  private applySnapshot(document: LayoutDocument): void {
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
    const stored = await this.archiveStore.read()
    if (stored) this.archive = stored
    const fallback = this.archive.documents[DEFAULT_LAYOUT_ID]
    if (!fallback) {
      const defaultDocument: NamedLayoutDocument = {
        ...this.exportLayout(),
        id: DEFAULT_LAYOUT_ID,
        name: DEFAULT_LAYOUT_NAME,
      }
      if (stored) {
        await this.updateArchive((current) => ({
          ...current,
          documents: { ...current.documents, [DEFAULT_LAYOUT_ID]: defaultDocument },
          activeId: DEFAULT_LAYOUT_ID,
        }))
      } else {
        const initial: LayoutArchive = {
          documents: { [DEFAULT_LAYOUT_ID]: defaultDocument },
          activeId: DEFAULT_LAYOUT_ID,
          autoSave: true,
        }
        await this.archiveStore.write(initial)
        this.archive = initial
      }
    } else if (stored) {
      const active = this.archive.documents[this.archive.activeId] ?? fallback
      // 关闭恢复时不改动图表，只把归档里的身份同步出来，手动切换仍然可用。
      if (this.options.restore !== false) this.applySnapshot(active)
      this.archive = { ...this.archive, activeId: active.id }
    }
    this.loaded = true
    this.markClean()
    this.publish()
    await this.dependencies.loadContent?.(this.requireDocument(this.archive.activeId))
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
   * 高频来源（视口逐帧滚动、缩放）只登记待检查，静止后比较一次配置。
   *
   * 每帧都 clear + set 定时器纯属浪费：这里记下最近一次变化时间，已经排定的检查
   * 按剩余时间自行续排。滚动期间定时器操作从每帧一次降到每个静止窗口一次。
   */
  scheduleCoalescedAutoSave(): void {
    if (this.applying || this.disposed) return
    this.coalescedAt = Date.now()
    if (this.coalescedTimer !== undefined) return
    this.armCoalescedCheck(COALESCED_CHECK_IDLE_MS)
  }

  /** 排定一次静止检查；触发时若期间仍有变化，只续排剩余时间，不重新计满窗口。 */
  private armCoalescedCheck(delay: number): void {
    this.coalescedTimer = setTimeout(() => {
      const remaining = COALESCED_CHECK_IDLE_MS - (Date.now() - this.coalescedAt)
      if (remaining > 0) {
        this.armCoalescedCheck(remaining)
        return
      }
      this.coalescedTimer = undefined
      this.scheduleAutoSave()
    }, delay)
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
    const snapshot = this.exportLayout()
    const targetId = this.archive.activeId
    await this.updateArchive((current) => {
      const target = current.documents[targetId]
      if (!target) throw new Error('布局不存在')
      return {
        ...current,
        documents: {
          ...current.documents,
          [targetId]: { ...snapshot, id: target.id, name: target.name },
        },
      }
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
      const name = requireName(input.name)
      const snapshot = this.exportLayout()
      await this.updateArchive((current) => {
        if (input.id && !current.documents[input.id]) throw new Error('布局不存在')
        return {
          ...current,
          documents: { ...current.documents, [id]: { ...snapshot, id, name } },
          activeId: id,
        }
      })
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
      try {
        this.applySnapshot(next)
        await this.updateArchive((current) => {
          if (!current.documents[input.id]) throw new Error('布局不存在')
          return { ...current, activeId: input.id }
        })
      } catch (error) {
        this.applySnapshot(previous)
        throw error
      }
      this.markClean()
      await this.dependencies.loadContent?.(next)
    })
  }

  /** 修改归档名称。 */
  renameLayout(input: { id: string; name: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      const name = requireName(input.name)
      await this.updateArchive((current) => {
        const target = current.documents[input.id]
        if (!target) throw new Error('布局不存在')
        return {
          ...current,
          documents: { ...current.documents, [input.id]: { ...target, name } },
        }
      })
    })
  }

  /** 复制已保存的文档，不改变当前图表。 */
  duplicateLayout(input: { id: string; name: string }): Promise<string> {
    return this.run(async () => {
      await this.load()
      const id = crypto.randomUUID()
      const name = requireName(input.name)
      const activeSnapshot = input.id === this.archive.activeId ? this.exportLayout() : null
      await this.updateArchive((current) => {
        const source = activeSnapshot ?? current.documents[input.id]
        if (!source) throw new Error('布局不存在')
        return {
          ...current,
          documents: { ...current.documents, [id]: { ...source, id, name } },
        }
      })
      return id
    })
  }

  /** 默认与当前正在使用的归档不能删除。 */
  deleteLayout(input: { id: string }): Promise<void> {
    return this.run(async () => {
      await this.load()
      await this.updateArchive((current) => {
        if (!current.documents[input.id]) throw new Error('布局不存在')
        if (input.id === DEFAULT_LAYOUT_ID || input.id === current.activeId)
          throw new Error('默认布局和当前布局不能删除')
        const documents = { ...current.documents }
        delete documents[input.id]
        return { ...current, documents }
      })
    })
  }

  /** 创建无用户指标的全新布局，并切换到它。 */
  createLayout(input: { name: string }): Promise<string> {
    return this.run(async () => {
      await this.load()
      if (this.shouldAutoSave()) await this.saveActive()
      const id = crypto.randomUUID()
      const document = { ...this.dependencies.createLayout(), id, name: requireName(input.name) }
      await this.updateArchive((current) => ({
        ...current,
        documents: { ...current.documents, [id]: document },
        activeId: id,
      }))
      this.applySnapshot(document)
      this.markClean()
      await this.dependencies.loadContent?.(document)
      return id
    })
  }

  /** 自动保存偏好与归档在同一存储事务里更新。 */
  setLayoutAutoSave(input: { enabled: boolean }): Promise<void> {
    return this.run(async () => {
      await this.load()
      clearTimeout(this.timer)
      await this.updateArchive((current) => ({ ...current, autoSave: input.enabled }))
      if (this.shouldAutoSave()) await this.saveActive()
    })
  }
}
