/** 脚本服务公开契约；源码版本、定义和执行端口属于同一提交。 */
import type {
  IndicatorSourceDefinition,
  ScriptOutputSource,
  ScriptRunOptions,
} from '@363045841yyt/klinechart-plot-contracts'

/** 文件树中的文件夹；路径按 kind 命名空间隔离，'' 表示分组根。 */
export interface ScriptFolder {
  readonly kind: 'indicator' | 'library'
  /** 以 / 分隔的层级路径，例如 策略/均线。 */
  readonly path: string
}

/** 已提交的不可变脚本文档；id 是图表定义身份。 */
interface ScriptDocumentFields {
  /** 宿主保存的信任状态，不能由脚本声明自行授予。 */
  readonly trusted: boolean
  readonly identity: 'builtin' | 'user'
  readonly id: string
  readonly revision: number
  readonly source: string
  /** 所属文件夹路径，'' 表示分组根。 */
  readonly folder: string
}

export type ScriptDocument = ScriptDocumentFields &
  (
    | { readonly kind: 'indicator'; readonly definition: IndicatorSourceDefinition }
    | { readonly kind: 'library'; readonly definition: { readonly name: string } }
  )

/** 工厂初始化 VM 并恢复文档；读取同步，写入等待持久化事务。 */
export interface ScriptService {
  readonly output: ScriptOutputSource
  /** 用当前图表行情直接执行草稿，不注册或保存定义。 */
  run(options: ScriptRunOptions): Promise<void>
  create(source: string, trusted?: boolean, folder?: string): Promise<ScriptDocument>
  createFolder(folder: ScriptFolder): Promise<void>
  /** 删除文件夹及其内部文档；仍被目录外脚本引用的库会阻止删除。 */
  removeFolder(folder: ScriptFolder): Promise<void>
  listFolders(): readonly ScriptFolder[]
  read(id: string): ScriptDocument | undefined
  list(): readonly ScriptDocument[]
  update(
    id: string,
    source: string,
    expectedRevision: number,
    trusted?: boolean,
  ): Promise<ScriptDocument>
  remove(id: string, expectedRevision: number): Promise<void>
  /** 应用关闭时终止脚本计算线程；销毁后注册计算入口不再可用。 */
  dispose(): void
}

/** 保存框架分配的稳定身份、用户源码和版本，编译产物启动时重新生成。 */
export interface SavedScript {
  readonly trusted: boolean
  readonly id: string
  readonly source: string
  readonly revision: number
  readonly folder: string
}

/** 一次持久化的完整用户工作区：脚本文档与空文件夹都参与恢复。 */
export interface ScriptWorkspace {
  readonly scripts: readonly SavedScript[]
  readonly folders: readonly ScriptFolder[]
}

/** 服务使用现有持久化基础设施，测试可注入同契约存储。 */
export interface ScriptPersistence {
  load(): Promise<ScriptWorkspace | null>
  save(workspace: ScriptWorkspace): Promise<boolean>
}

/** 内置源码只参与启动注册，不进入用户持久化。 */
export interface ScriptServiceOptions {
  readonly builtinSources?: readonly string[]
  readonly persistence?: ScriptPersistence
}
