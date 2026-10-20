/** 脚本服务公开契约；源码版本、定义和执行端口属于同一提交。 */
import type {
  IndicatorSourceDefinition,
  ScriptOutputSource,
} from '@363045841yyt/klinechart-plot-contracts'

/** 已提交的不可变脚本文档；id 是图表定义身份。 */
export interface ScriptDocument {
  /** 宿主保存的信任状态，不能由脚本声明自行授予。 */
  readonly trusted: boolean
  readonly identity: 'builtin' | 'user'
  readonly id: string
  readonly revision: number
  readonly source: string
  readonly definition: IndicatorSourceDefinition
}

/** 工厂初始化 VM 并恢复文档；读取同步，写入等待持久化事务。 */
export interface ScriptService {
  readonly output: ScriptOutputSource
  create(source: string, trusted?: boolean): Promise<ScriptDocument>
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
}

/** 服务使用现有持久化基础设施，测试可注入同契约存储。 */
export interface ScriptPersistence {
  load(): Promise<readonly SavedScript[] | null>
  save(scripts: readonly SavedScript[]): Promise<boolean>
}

/** 内置源码只参与启动注册，不进入用户持久化。 */
export interface ScriptServiceOptions {
  readonly builtinSources?: readonly string[]
  readonly persistence?: ScriptPersistence
}
