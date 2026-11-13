/**
 * 持久化公共契约：编解码边界、单文档仓库、事务与驱动。
 *
 * @remarks
 * 本文件只描述语义，不依赖 `impl/`。核心约定：
 * - `read()` 返回 `null` 仅表示「记录确实不存在」；读取失败、数据损坏、存储不可用一律抛错。
 * - 写入只有在事务提交后才算成功，调用方拿不到模糊的布尔结果。
 * - 需要「读出来改完再写回」时必须使用 `update()`，它在同一个事务内完成读取和写入。
 */

/** 存储值与领域值之间的显式边界；结构不可识别时返回 null，由公共层判定为损坏。 */
export interface PersistenceCodec<T> {
  decode(value: unknown): T | null
  encode(value: T): unknown
}

/** 一个按键定位的文档仓库；所有失败都以异常表达。 */
export interface DocumentStore<T> {
  /** 读取并解码；`null` 只表示记录不存在，其余失败抛出原始或包装后的错误。 */
  read(): Promise<T | null>
  /** 覆盖写入整份文档。 */
  write(value: T): Promise<void>
  /** 在同一事务内读取、变换并写回；`current` 为 null 时表示记录不存在。 */
  update(change: (current: T | null) => T): Promise<T>
  /** 删除该文档。 */
  remove(): Promise<void>
  /** 关闭底层连接并拒绝后续操作；重复调用不抛错。 */
  dispose(): Promise<void>
}

/** 事务内可用的最小请求集；同一事务里的读取与写入天然串行。 */
export interface DocumentTransaction {
  get(storeName: string, key: IDBValidKey): Promise<unknown>
  put(storeName: string, value: unknown, key: IDBValidKey): Promise<void>
  delete(storeName: string, key: IDBValidKey): Promise<void>
}

/** IndexedDB 连接与事务的所有者；领域层只通过它与数据库交互。 */
export interface IndexedDbDriver {
  /** 在指定 store 上执行一个事务；`run` 内不得夹带与本事务无关的异步等待。 */
  transaction<R>(
    storeNames: readonly string[],
    mode: 'readonly' | 'readwrite',
    run: (transaction: DocumentTransaction) => Promise<R>,
  ): Promise<R>
  /** 关闭连接；之后的操作以 `PERSISTENCE_CLOSED` 失败。 */
  dispose(): Promise<void>
}

/** 打开驱动时的结构声明；升级逻辑只在这里出现。 */
export interface CreateIndexedDbDriverOptions {
  readonly databaseName: string
  readonly version: number
  /** 在升级事务内创建/调整 object store；旧版本号由 IndexedDB 提供。 */
  readonly upgrade?: (
    database: IDBDatabase,
    transaction: IDBTransaction,
    oldVersion: number,
  ) => void
}

/** 创建单文档仓库的选项。 */
export interface CreateDocumentStoreOptions<T> {
  readonly databaseName: string
  readonly version: number
  readonly storeName: string
  readonly key: IDBValidKey
  readonly codec: PersistenceCodec<T>
  /** 复用已有驱动；省略时仓库独占一个驱动并在 `dispose()` 时关闭。 */
  readonly driver?: IndexedDbDriver
}
