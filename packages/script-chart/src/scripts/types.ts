/** 脚本服务公开契约；源码版本、定义和执行端口属于同一提交。 */
import type { QuickJSScriptDefinition } from '@363045841yyt/klinechart-script'

/** 已提交的不可变脚本文档；id 是图表定义身份。 */
export interface ScriptDocument {
  readonly id: string
  readonly revision: number
  readonly source: string
  readonly definition: QuickJSScriptDefinition
}

/** 同步 CRUD 服务，创建前由工厂异步初始化 VM。 */
export interface ScriptService {
  create(source: string): ScriptDocument
  read(id: string): ScriptDocument | undefined
  list(): readonly ScriptDocument[]
  update(id: string, source: string, expectedRevision: number): ScriptDocument
  remove(id: string, expectedRevision: number): void
}
