// 布局管理领域入口：具名文档与自动保存偏好统一存为一份归档，列表按文档创建顺序稳定输出。
import {
  createIndexedDbDocumentStore,
  type DocumentStore,
} from '../../../foundation/persistence/index.js'
import { asReadonlySignal, batch, createSignal } from '../../../foundation/reactivity/signal.js'
import {
  LAYOUT_DOCUMENT_VERSION,
  type LayoutApi,
  type LayoutArchive,
  type LayoutDocument,
  type LayoutSummary,
  type NamedLayoutDocument,
} from '../types.js'
import { migrateLayoutDrawingLabels } from './migrateDrawingLabels.js'

const DEFAULT_LAYOUT_ID = 'default'
const DEFAULT_LAYOUT_NAME = '默认布局'
const AUTO_SAVE_DEBOUNCE_MS = 600
/** 高频来源（视口滚动、缩放）静止多久后再比较配置。 */
const COALESCED_CHECK_IDLE_MS = 250

/** 判断值是否为普通对象（排除 null 与数组）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 具名文档的最小结构校验：版本与工作区形状；价格轴等可选字段由恢复 layer 补齐。 */
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

/** 归档存储校验：只接受结构完整的文档，其余内容留给内存状态重建。 */
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
    if (isNamedLayoutDocument(document)) documents[id] = migrateLayoutDrawingLabels(document)
  }
  return { documents, activeId: value.activeId, autoSave: value.autoSave }
}

/** 布局名在存储前拒绝空白；与界面的校验文案保持一致。 */
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
  /** 最近一次高频变化的时间；检查触发时据此判断是否已经静止。 */
  private coalescedAt = 0
  private applying = false
  private disposed = false
  private lastConfiguration = ''
  private loaded = false
  private queue: Promise<unknown> = Promise.resolve()
  readonly layouts = asReadonlySignal(this.layoutSignal)
  readonly activeLayoutId = asReadonlySignal(this.activeSignal)
  readonly layoutAutoSave = asReadonlySignal(this.autoSaveSignal)
  readonly layoutDirty = asReadonlySignal(this.dirtySignal)
  readonly layoutSaveError = asReadonlySignal(this.errorSignal)

  /** 注册布局原子恢复端口；构造函数只保存第二层运行时状态。 */
  constructor(
    private readonly dependencies: {
      exportLayout(): LayoutDocument
      applyLayout(document: LayoutDocument): void
      createLayout(): LayoutDocument
      /** 布局或分区的异步恢复内容；例如图表区间恢复。 */
      loadContent?(document: LayoutDocument): Promise<void>
    },
    /**
     * `restore: false` 时归档只作为手动保存/切换的仓库：
     * 读取但不把活动布局应用到图表，避免每次启动或标签切换产生意外覆盖。
     */
    private readonly options: { restore?: boolean; storageId?: string } = {},
  ) {
    this.archiveStore = createIndexedDbDocumentStore<LayoutArchive>({
      databaseName: '@363045841yyt/klinechart-layouts',
      version: LAYOUT_DOCUMENT_VERSION,
      storeName: 'layouts',
      // 每个工作区独立占用自己的归档键，避免跨工作区写入覆盖。
      key: options.storageId === undefined ? 'documents' : ['documents', options.storageId],
      codec: { decode: decodeArchive, encode: (value) => value },
    })
    globalThis.addEventListener?.('pagehide', this.onPageHide)
  }

  // ── 状态判断 ──

  /** 是否应把当前配置写回活动布局：已加载、允许自动保存且未销毁。 */
  private shouldAutoSave(): boolean {
    return this.loaded && this.archive.autoSave && !this.disposed
  }

  /** 当前配置的稳定字符串，用于判断是否真的发生了变更。 */
  private currentConfiguration(): string {
    return JSON.stringify(this.exportLayout())
  }

  /** 把当前配置记为干净基线；恢复到干净状态后调用。 */
  private markClean(): void {
    this.lastConfiguration = this.currentConfiguration()
    this.dirtySignal.set(false)
  }

  /** 把未知错误转成简短的界面可读错误信号。 */
  private reportError(error: unknown, fallback: string): void {
    this.errorSignal.set(error instanceof Error ? error.message : fallback)
  }

  // ── 归档读写 ──

  /**
   * 在单个事务内基于内存快照更新归档，应用变更后再把结果发布回内存。
   *
   * 读取失败或归档缺失时直接失败，数据层保持原状，而不是生成空快照。
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

  /** 只发布归档摘要；文档创建顺序稳定，不因切换活动文档改变列表位置。 */
  private publish(): void {
    const { documents, activeId, autoSave } = this.archive
    const layouts = Object.freeze(
      Object.entries(documents).map(([id, document]) =>
        Object.freeze({
          id,
          name: document.name,
          deletable: id !== DEFAULT_LAYOUT_ID && id !== activeId,
        }),
      ),
    )
    batch(() => {
      this.layoutSignal.set(layouts)
      this.activeSignal.set(activeId)
      this.autoSaveSignal.set(autoSave)
    })
  }

  /** 找不到文档时明确失败，不静默退回默认文档。 */
  private requireDocument(id: string): NamedLayoutDocument {
    const document = this.archive.documents[id]
    if (!document) throw new Error('布局不存在')
    return document
  }

  /** 串行化归档操作；单次失败不阻断后续操作。 */
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  // ── 生命周期 ──

  /** 页面离开时补写自动保存。 */
  private readonly onPageHide = (): void => {
    this.flushCoalescedAutoSave()
    if (!this.shouldAutoSave()) return
    void this.run(() => this.saveActive()).catch((error: unknown) =>
      this.reportError(error, '自动保存失败'),
    )
  }

  /** 释放计时器，并补写已开启的自动保存。 */
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

  // ── 布局操作 ──

  /** 返回当前图表的文档快照。 */
  exportLayout(): LayoutDocument {
    return this.dependencies.exportLayout()
  }

  /** 把文档恢复到图表；用于恢复或重载，文档由调用方或索引提供。 */
  async applyLayout(input: LayoutDocument): Promise<void> {
    const document = migrateLayoutDrawingLabels(input)
    this.applySnapshot(document)
    await this.dependencies.loadContent?.(document)
  }

  /** 同步恢复配置；恢复期间屏蔽状态通知，避免触发自动保存。 */
  private applySnapshot(document: LayoutDocument): void {
    this.applying = true
    try {
      this.dependencies.applyLayout(structuredClone(document))
    } finally {
      this.applying = false
    }
  }

  /** 首次加载回归档；默认布局取图表首次使用或创建时的快照。 */
  private async load(): Promise<void> {
    if (this.loaded) return
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
      // 关闭恢复时，只把归档载入但不回填图表，否则用户手动切换前会被覆盖。
      if (this.options.restore !== false) this.applySnapshot(active)
      this.archive = { ...this.archive, activeId: active.id }
    }
    this.loaded = true
    this.markClean()
    this.publish()
    await this.dependencies.loadContent?.(this.requireDocument(this.archive.activeId))
  }

  /** 启动时恢复上次使用的归档；失败只发布错误信号展示。 */
  initialize(): Promise<void> {
    return this.run(() => this.load()).catch((error: unknown) =>
      this.reportError(error, '布局读取失败'),
    )
  }

  /** 监听配置变化并恢复自动保存通知，按防抖写回。 */
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
   * 高频来源（视口滚动、缩放）的合并保存：只记录触发时间，避免每帧比较一次配置。
   *
   * 每帧都 clear + set 计时器会造成多余唤醒；这里只在第一次变化时排队检查，已经排队的
   * 检查在剩余时间内继续等待，静止期间定时器不重复触发，每轮静止只触发一次。
   */
  scheduleCoalescedAutoSave(): void {
    if (this.applying || this.disposed) return
    this.coalescedAt = Date.now()
    if (this.coalescedTimer !== undefined) return
    this.armCoalescedCheck(COALESCED_CHECK_IDLE_MS)
  }

  /** 排队一次静止检查；检查到期时若仍在变化，只补齐剩余时间，不重置周期。 */
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

  /** 切换前先把当前快照写入归档，避免切换期间丢失最后一次修改。 */
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
    // 保存期间若有新的变更，继续标记为脏，并再排一次保存。
    if (this.currentConfiguration() === JSON.stringify(snapshot)) this.dirtySignal.set(false)
    else this.scheduleAutoSave()
  }

  /** 查询所有布局，同时初始化默认归档。 */
  listLayouts(): Promise<ReadonlyArray<LayoutSummary>> {
    return this.run(async () => {
      await this.load()
      return this.layouts.peek()
    })
  }

  /** 保存当前图表；带 id 时覆盖指定归档，否则生成新状态并新建归档文档。 */
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

  /** 切换到已保存的图表配置；恢复失败时保留当前数据。 */
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

  /** 复制已保存的文档，不改变当前图表状态。 */
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

  /** 删除非当前布局且非默认布局的归档。 */
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

  /** 用用户指定的全新布局，并切换过去。 */
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

  /** 自动保存偏好与归档存在同一存储，随归档一起更新。 */
  setLayoutAutoSave(input: { enabled: boolean }): Promise<void> {
    return this.run(async () => {
      await this.load()
      clearTimeout(this.timer)
      await this.updateArchive((current) => ({ ...current, autoSave: input.enabled }))
      if (this.shouldAutoSave()) await this.saveActive()
    })
  }
}
