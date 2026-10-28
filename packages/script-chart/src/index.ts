/** 脚本与图表的装配入口：完整源码文档的生命周期服务。 */
export { createBuiltinScriptService } from './scripts/impl/createBuiltinScriptService.js'
export { createScriptService } from './scripts/impl/createScriptService.js'
export type {
  SavedScript,
  ScriptDocument,
  ScriptFolder,
  ScriptFolderRemoval,
  ScriptPersistence,
  ScriptService,
  ScriptServiceOptions,
  ScriptWorkspace,
} from './scripts/types.js'
