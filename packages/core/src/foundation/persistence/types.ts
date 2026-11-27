/**
 * 持久化公共契约：只描述文档仓库、事务驱动和键空间。
 *
 * 契约里不出现任何宿主存储 API；驱动由组合根创建并释放，仓库只使用传入的驱动。
 *
 * - `read()` 返回 `null` 只表示记录确实不存在；读取失败、记录损坏或存储不可用一律抛错。
 * - 写入只按整份文档提交；成功后返回新值，不做部分更新。
 * - 需要基于当前值计算新值时使用 `update()`，读取与写入在同一次事务内完成。
 */

/** 存储值与其内存形式之间的编解码边界；结构不识别时返回 null。 */
export interface PersistenceCodec<T> {
  decode(value: unknown): T | null
  encode(value: T): unknown
}

/**
 * 文档键。
 *
 * 字符串用于单文档仓库；字符串数组用于同一 store 内按维度分区。两种形状都必须被驱动支持。
 */
export type DocumentKey = string | readonly string[]

/** 一个事务内可用的最小能力；同一事务内的读写天然有序。 */
export interface DocumentTransaction {
  get(storeName: string, key: DocumentKey): Promise<unknown>
  put(storeName: string, value: unknown, key: DocumentKey): Promise<void>
  delete(storeName: string, key: DocumentKey): Promise<void>
}

/** 文档仓库的底层驱动；生命周期由创建它的组合根负责。 */
export interface DocumentDriver {
  transaction<R>(
    storeNames: readonly string[],
    mode: 'readonly' | 'readwrite',
    run: (transaction: DocumentTransaction) => Promise<R>,
  ): Promise<R>
  dispose(): Promise<void>
}

/** 一个独立位置的文档仓库；所有失败都以异常表达。 */
export interface DocumentStore<T> {
  /** 读取并解码；`null` 只表示记录不存在，失败抛原始或包装后的错误。 */
  read(): Promise<T | null>
  /** 整份写入；编码失败视为调用方契约错误，不兜底。 */
  write(value: T): Promise<void>
  /** 同一事务内读取并变换后写回；`current` 为 null 表示记录不存在。 */
  update(change: (current: T | null) => T): Promise<T>
  /** 删除整份文档。 */
  remove(): Promise<void>
  /** 释放仓库自身；底层驱动由它的创建者释放。 */
  dispose(): Promise<void>
}

/** 创建文档仓库的选项；驱动必须由调用方提供。 */
export interface CreateDocumentStoreOptions<T> {
  readonly driver: DocumentDriver
  readonly storeName: string
  readonly key: DocumentKey
  readonly codec: PersistenceCodec<T>
}
