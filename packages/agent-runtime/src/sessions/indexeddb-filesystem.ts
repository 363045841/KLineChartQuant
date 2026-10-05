// 本文件用 IndexedDB 实现官方 JSONL 存储所需的文件系统，不实现 Pi 的记录或事务模型。
import type { Context } from '@earendil-works/chord'
import {
  FileError,
  type FileInfo,
  type FileSystem,
  type Result,
  type TextLineReader,
} from '@earendil-works/pi-durable/env'

const FILE_STORE = 'files'
const DATABASE_VERSION = 1
const ROOT_PATH = '/'
type StoredFile = { path: string; kind: 'file' | 'directory'; bytes: Uint8Array; mtimeMs: number }

/** 将 IndexedDB 请求转换为 Promise。 */
function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 校验浏览器存储读取的文件记录。 */
function isFile(value: unknown): value is StoredFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof value.path === 'string' &&
    'kind' in value &&
    (value.kind === 'file' || value.kind === 'directory') &&
    'bytes' in value &&
    value.bytes instanceof Uint8Array &&
    'mtimeMs' in value &&
    typeof value.mtimeMs === 'number'
  )
}

/** 将可移植路径规范化为 IndexedDB 键。 */
function pathOf(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}

/** 返回文件记录的公开元数据。 */
function info(file: StoredFile): FileInfo {
  return {
    path: file.path,
    name: file.path.split('/').at(-1) ?? '',
    kind: file.kind,
    size: file.bytes.byteLength,
    mtimeMs: file.mtimeMs,
  }
}

/** 独立的 IndexedDB 文件系统；单个写操作在事务完成后才报告成功。 */
export class IndexedDbFileSystem implements FileSystem {
  readonly id: string
  cwd = ROOT_PATH
  private constructor(private readonly database: IDBDatabase) {
    this.id = database.name
  }

  /** 打开持久化文件数据库并创建根目录。 */
  static async open(databaseName: string): Promise<IndexedDbFileSystem> {
    const request = indexedDB.open(databaseName, DATABASE_VERSION)
    request.onupgradeneeded = () =>
      request.result.createObjectStore(FILE_STORE, { keyPath: 'path' })
    const database = await requested(request)
    const fs = new IndexedDbFileSystem(database)
    await fs.transaction('readwrite', async (store) => {
      if (!(await requested(store.get(ROOT_PATH))))
        store.put({
          path: ROOT_PATH,
          kind: 'directory',
          bytes: new Uint8Array(),
          mtimeMs: Date.now(),
        })
    })
    return fs
  }

  /** 执行单个文件操作并等待整个 IndexedDB 事务提交。 */
  private async transaction<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const tx = this.database.transaction(FILE_STORE, mode, {
      durability: mode === 'readwrite' ? 'strict' : 'default',
    })
    const completed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
    try {
      const result = await action(tx.objectStore(FILE_STORE))
      await completed
      return result
    } catch (error) {
      try {
        tx.abort()
      } catch {
        /* 已结算的事务无需再次中止。 */
      }
      await completed.catch(() => {})
      throw error
    }
  }

  /** 将底层错误转换为官方文件系统 Result。 */
  private async result<T>(
    path: string,
    context: Context,
    action: () => Promise<T>,
  ): Promise<Result<T, FileError>> {
    try {
      if (context.abortSignal?.aborted)
        throw new FileError('aborted', 'File operation aborted', path)
      return { ok: true, value: await action() }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof FileError ? error : new FileError('unknown', String(error), path),
      }
    }
  }

  /** 读取并验证一个文件。 */
  private async file(store: IDBObjectStore, path: string): Promise<StoredFile> {
    const value: unknown = await requested(store.get(pathOf(path)))
    if (!isFile(value)) throw new FileError('not_found', 'File not found', path)
    return value
  }

  /** 在一个事务内更新文件字节，追加不会产生读写竞争。 */
  private write(
    path: string,
    context: Context,
    change: (previous: Uint8Array) => Uint8Array,
    requireExisting = false,
  ): Promise<Result<void, FileError>> {
    return this.result(path, context, () =>
      this.transaction('readwrite', async (store) => {
        const key = pathOf(path)
        const previous: unknown = await requested(store.get(key))
        if (isFile(previous) && previous.kind !== 'file')
          throw new FileError('is_directory', 'Path is a directory', path)
        if (requireExisting && !isFile(previous))
          throw new FileError('not_found', 'File not found', path)
        store.put({
          path: key,
          kind: 'file',
          bytes: change(isFile(previous) ? previous.bytes : new Uint8Array()),
          mtimeMs: Date.now(),
        })
      }),
    )
  }

  /** 返回绝对路径。 */
  async absolutePath(path: string, context: Context) {
    return this.result(path, context, async () =>
      pathOf(path.startsWith('/') ? path : `${this.cwd}/${path}`),
    )
  }
  /** 合并路径片段。 */
  async joinPath(parts: string[], context: Context) {
    return this.absolutePath(parts.join('/'), context)
  }
  /** 读取原始字节。 */
  async readBinaryFile(path: string, context: Context) {
    return this.result(path, context, () =>
      this.transaction('readonly', async (store) => {
        const file = await this.file(store, path)
        if (file.kind !== 'file') throw new FileError('is_directory', 'Path is a directory', path)
        return file.bytes
      }),
    )
  }
  /** 读取 UTF-8 文本。 */
  async readTextFile(path: string, context: Context): Promise<Result<string, FileError>> {
    const result = await this.readBinaryFile(path, context)
    return result.ok ? { ok: true, value: new TextDecoder().decode(result.value) } : result
  }
  /** 提供逐行读取，并保留末行是否有换行的信息。 */
  async openTextLineReader(
    path: string,
    context: Context,
  ): Promise<Result<TextLineReader, FileError>> {
    const result = await this.readTextFile(path, context)
    if (!result.ok) return result
    const lines = result.value.split('\n')
    let index = 0
    let closed = false
    return {
      ok: true,
      value: {
        async readLine(readContext) {
          if (readContext.abortSignal?.aborted)
            return { ok: false, error: new FileError('aborted', 'Line read aborted', path) }
          if (
            closed ||
            index >= lines.length ||
            (index === lines.length - 1 && lines[index] === '')
          )
            return { ok: true, value: undefined }
          const text = lines[index++] ?? ''
          return { ok: true, value: { text, terminated: index < lines.length } }
        },
        async close() {
          closed = true
        },
      },
    }
  }
  /** 返回指定数量的文本行。 */
  async readTextLines(
    path: string,
    options: { maxLines?: number } | undefined,
    context: Context,
  ): Promise<Result<string[], FileError>> {
    const result = await this.readTextFile(path, context)
    if (!result.ok) return result
    const lines = result.value.split('\n')
    if (lines.at(-1) === '') lines.pop()
    return { ok: true, value: lines.slice(0, options?.maxLines) }
  }
  /** 原子替换文件。 */
  writeFile(path: string, content: string | Uint8Array, context: Context) {
    return this.write(path, context, () =>
      typeof content === 'string' ? new TextEncoder().encode(content) : content,
    )
  }
  /** 原子追加文件。 */
  appendFile(path: string, content: string | Uint8Array, context: Context) {
    return this.write(path, context, (previous) => {
      const next = typeof content === 'string' ? new TextEncoder().encode(content) : content
      const bytes = new Uint8Array(previous.length + next.length)
      bytes.set(previous)
      bytes.set(next, previous.length)
      return bytes
    })
  }
  /** 截断或补零扩展文件。 */
  truncateFile(path: string, size: number, context: Context) {
    return this.write(
      path,
      context,
      (previous) => {
        const bytes = new Uint8Array(size)
        bytes.set(previous.subarray(0, size))
        return bytes
      },
      true,
    )
  }
  /** 写操作已经等待事务完成，无额外缓冲。 */
  async flushFile(path: string, context: Context) {
    return this.result(path, context, async () => {
      const result = await this.fileInfo(path, context)
      if (!result.ok) throw result.error
    })
  }
  /** 在单个事务中移动文件。 */
  async renameFile(source: string, destination: string, context: Context) {
    return this.result(source, context, () =>
      this.transaction('readwrite', async (store) => {
        const file = await this.file(store, source)
        store.put({ ...file, path: pathOf(destination) })
        store.delete(pathOf(source))
      }),
    )
  }
  /** 返回文件元数据。 */
  async fileInfo(path: string, context: Context) {
    return this.result(path, context, () =>
      this.transaction('readonly', async (store) => info(await this.file(store, path))),
    )
  }
  /** 列出目录的直属子项。 */
  async listDir(path: string, context: Context) {
    return this.result(path, context, () =>
      this.transaction('readonly', async (store) => {
        const folder = await this.file(store, path)
        if (folder.kind !== 'directory')
          throw new FileError('not_directory', 'Path is not a directory', path)
        const prefix = `${pathOf(path).replace(/\/$/, '')}/`
        const values: unknown[] = await requested(store.getAll())
        return values
          .filter(isFile)
          .filter(
            (file) =>
              file.path.startsWith(prefix) &&
              file.path !== pathOf(path) &&
              !file.path.slice(prefix.length).includes('/'),
          )
          .map(info)
      }),
    )
  }
  /** 本文件系统没有符号链接。 */
  canonicalPath(path: string, context: Context) {
    return this.absolutePath(path, context)
  }
  /** 检查路径是否存在。 */
  async exists(path: string, context: Context) {
    return this.result(path, context, () =>
      this.transaction('readonly', async (store) =>
        isFile(await requested(store.get(pathOf(path)))),
      ),
    )
  }
  /** 创建目录，可递归创建父目录。 */
  async createDir(path: string, options: { recursive?: boolean } | undefined, context: Context) {
    return this.result(path, context, () =>
      this.transaction('readwrite', async (store) => {
        const parts = pathOf(path).split('/').filter(Boolean)
        for (let index = 1; index <= parts.length; index++) {
          const key = `/${parts.slice(0, index).join('/')}`
          if (
            index < parts.length &&
            !options?.recursive &&
            !isFile(await requested(store.get(key)))
          )
            throw new FileError('not_found', 'Parent directory missing', key)
          const previous: unknown = await requested(store.get(key))
          if (isFile(previous) && previous.kind !== 'directory')
            throw new FileError('not_directory', 'Path is not a directory', key)
          if (!previous)
            store.put({
              path: key,
              kind: 'directory',
              bytes: new Uint8Array(),
              mtimeMs: Date.now(),
            })
        }
      }),
    )
  }
  /** 删除文件或目录；非递归删除拒绝非空目录。 */
  async remove(
    path: string,
    options: { recursive?: boolean; force?: boolean } | undefined,
    context: Context,
  ) {
    return this.result(path, context, () =>
      this.transaction('readwrite', async (store) => {
        const key = pathOf(path)
        const values: unknown[] = await requested(store.getAll())
        const files = values.filter(isFile)
        if (!files.some((file) => file.path === key) && !options?.force)
          throw new FileError('not_found', 'File not found', key)
        const descendants = files.filter((file) => file.path.startsWith(`${key}/`))
        if (descendants.length && !options?.recursive)
          throw new FileError('invalid', 'Directory is not empty', key)
        for (const file of descendants) store.delete(file.path)
        store.delete(key)
      }),
    )
  }
  /** 创建临时目录。 */
  async createTempDir(
    prefix: string | undefined,
    context: Context,
  ): Promise<Result<string, FileError>> {
    const path = pathOf(`${prefix ?? 'tmp'}-${globalThis.crypto.randomUUID()}`)
    const result = await this.createDir(path, { recursive: true }, context)
    return result.ok ? { ok: true, value: path } : result
  }
  /** 创建临时文件。 */
  async createTempFile(
    options: { prefix?: string; suffix?: string } | undefined,
    context: Context,
  ): Promise<Result<string, FileError>> {
    const path = pathOf(
      `${options?.prefix ?? 'tmp'}-${globalThis.crypto.randomUUID()}${options?.suffix ?? ''}`,
    )
    const result = await this.writeFile(path, '', context)
    return result.ok ? { ok: true, value: path } : result
  }
  /** 关闭 IndexedDB 连接。 */
  async cleanup(): Promise<void> {
    this.database.close()
  }
}
